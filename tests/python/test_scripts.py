"""Regression tests for scripts/.

These exist so dependency upgrades cannot break the monthly contributions
workflow silently. Nothing under scripts/ had CI coverage before, which meant a
PyGithub or openai major would only surface when the scheduled run failed --
long after the PR that caused it merged.

Scope is deliberately the pure, deterministic helpers: no network, no API keys,
no model calls. That is enough to catch the failure mode that matters here --
an upgraded dependency changing behaviour these functions depend on, or the
modules failing to import at all.
"""

import importlib.util
import json
import sys
from types import SimpleNamespace
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load(module_name: str):
    """Import a script by path.

    scripts/ is not a package and the filenames are not importable as-is from
    the repo root, so go through the spec machinery rather than mutating
    sys.path and hoping.
    """
    path = REPO_ROOT / "scripts" / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec and spec.loader, f"could not build import spec for {path}"
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


contributions = _load("fetch_contributions")
publications = _load("fetch_publications")


class TestSlug:
    def test_lowercases_and_hyphenates(self):
        assert contributions._slug("Galaxy Core") == "galaxy-core"

    def test_collapses_runs_of_separators(self):
        assert contributions._slug("a  --  b") == "a-b"

    def test_strips_leading_and_trailing_separators(self):
        assert contributions._slug("!! Hello !!") == "hello"


class TestLoadJson:
    def test_returns_default_when_unset(self, monkeypatch):
        monkeypatch.delenv("SOME_VAR", raising=False)
        assert contributions._load_json("SOME_VAR", ["fallback"]) == ["fallback"]

    def test_parses_valid_json(self, monkeypatch):
        monkeypatch.setenv("SOME_VAR", '[{"a": 1}]')
        assert contributions._load_json("SOME_VAR", []) == [{"a": 1}]

    def test_falls_back_on_malformed_json(self, monkeypatch):
        monkeypatch.setenv("SOME_VAR", "{not json")
        assert contributions._load_json("SOME_VAR", "default") == "default"


class TestLoadModels:
    def test_defaults_when_unset(self, monkeypatch):
        monkeypatch.delenv("AI_MODELS", raising=False)
        assert contributions._load_models() == list(contributions.DEFAULT_AI_MODELS)

    def test_json_array_of_strings(self, monkeypatch):
        monkeypatch.setenv("AI_MODELS", '["model-a", "model-b"]')
        assert contributions._load_models() == ["model-a", "model-b"]

    def test_comma_separated_plain_text(self, monkeypatch):
        monkeypatch.setenv("AI_MODELS", "model-a, model-b")
        assert contributions._load_models() == ["model-a", "model-b"]

    def test_newline_separated_plain_text(self, monkeypatch):
        monkeypatch.setenv("AI_MODELS", "model-a\nmodel-b\n")
        assert contributions._load_models() == ["model-a", "model-b"]


class TestIterJsonObjects:
    def test_single_object(self):
        assert list(contributions._iter_json_objects('{"a": 1}')) == ['{"a": 1}']

    def test_multiple_objects(self):
        text = '{"a": 1} and then {"b": 2}'
        assert list(contributions._iter_json_objects(text)) == ['{"a": 1}', '{"b": 2}']

    def test_object_wrapped_in_prose(self):
        text = 'Here is the card:\n{"title": "X"}\nHope that helps!'
        assert list(contributions._iter_json_objects(text)) == ['{"title": "X"}']

    def test_nested_objects_yield_outermost_only(self):
        text = '{"outer": {"inner": 1}}'
        assert list(contributions._iter_json_objects(text)) == ['{"outer": {"inner": 1}}']

    def test_braces_inside_strings_do_not_affect_nesting(self):
        text = '{"desc": "a } brace"}'
        assert list(contributions._iter_json_objects(text)) == ['{"desc": "a } brace"}']

    def test_escaped_quote_inside_string(self):
        text = r'{"desc": "say \"hi\" }"}'
        assert list(contributions._iter_json_objects(text)) == [text]

    def test_no_objects(self):
        assert list(contributions._iter_json_objects("no json here")) == []


class TestDumpProjectJson:
    """The on-disk project cards are hand-authored and formatted by convention.

    _dump_project_json has to reproduce that formatting exactly, or the monthly
    workflow reflows every file it touches and turns a one-line link addition
    into a whole-file diff. Rather than assert the convention in the abstract,
    round-trip the real files.
    """

    @pytest.mark.parametrize(
        "project_file",
        sorted((REPO_ROOT / "src" / "content" / "projects").glob("*.json")),
        ids=lambda p: p.name,
    )
    def test_round_trips_committed_files_byte_for_byte(self, project_file):
        original = project_file.read_text(encoding="utf-8")
        data = json.loads(original)
        assert contributions._dump_project_json(data) == original.rstrip("\n")

    def test_renders_links_one_per_line(self):
        rendered = contributions._dump_project_json(
            {"title": "X", "links": [{"label": "A", "url": "u"}, {"label": "B", "url": "v"}]}
        )
        assert '    { "label": "A", "url": "u" },' in rendered
        assert '    { "label": "B", "url": "v" }' in rendered

    def test_inlines_simple_arrays(self):
        rendered = contributions._dump_project_json({"tags": ["a", "b"]})
        assert '"tags": ["a", "b"]' in rendered


class TestNormalizeTitle:
    def test_strips_punctuation_and_case(self):
        assert publications.normalize_title("Galaxy: A Platform!") == "galaxyaplatform"

    def test_equal_for_titles_differing_only_in_punctuation(self):
        assert publications.normalize_title("A/B testing") == publications.normalize_title(
            "A B  testing"
        )


class TestMapOrcidType:
    @pytest.mark.parametrize(
        ("orcid_type", "expected"),
        [
            ("conference-presentation", "Presentation"),
            ("conference-poster", "Poster"),
            ("journal-article", "Paper"),
            ("preprint", "Preprint"),
            ("book-chapter", "Book Chapter"),
            ("book", "Book"),
        ],
    )
    def test_known_types(self, orcid_type, expected):
        assert publications.map_orcid_type(orcid_type) == expected

    def test_is_case_insensitive(self):
        assert publications.map_orcid_type("Journal-Article") == "Paper"

    def test_unknown_type_is_humanised(self):
        assert publications.map_orcid_type("data-set") == "Data Set"


class TestYearSortKey:
    """Undated works must not outrank real years.

    `year` is a string so it can hold UNKNOWN_YEAR, and sorting those strings
    descending puts "Unknown" first ("U" > "2") -- i.e. an undated work renders
    as the most prominent entry on the resume.
    """

    def test_numeric_years_compare_numerically(self):
        assert publications.year_sort_key("2026") > publications.year_sort_key("2024")

    def test_unknown_sorts_below_every_real_year(self):
        assert publications.year_sort_key(publications.UNKNOWN_YEAR) < (
            publications.year_sort_key("1900")
        )

    def test_orders_a_realistic_mixed_list_newest_first(self):
        pubs = [
            {"year": "2024", "title": "b"},
            {"year": publications.UNKNOWN_YEAR, "title": "a"},
            {"year": "2026", "title": "c"},
        ]
        pubs.sort(key=lambda p: p["title"])
        pubs.sort(key=lambda p: publications.year_sort_key(p["year"]), reverse=True)
        assert [p["year"] for p in pubs] == ["2026", "2024", publications.UNKNOWN_YEAR]

    def test_non_numeric_junk_does_not_raise(self):
        assert publications.year_sort_key("n/a") == -1


def test_scripts_import_cleanly():
    """Guards the actual upgrade failure mode.

    A PyGithub or openai major that renames or removes a top-level symbol
    breaks these modules at import time. Everything above would then error
    during collection, so assert it directly for a legible failure.
    """
    assert hasattr(contributions, "ContributionsFetcher")
    assert hasattr(publications, "main")


class TestForkAwareCoverage:
    """A fork of an already-covered repo must not become its own card.

    The September 2026 run added a card for IvoLeist/galaxytools -- a fork of
    bgruening/galaxytools, which galaxy-core.json already links. Coverage was
    an exact owner/repo match, so a fork could never resolve to its upstream.
    """

    @staticmethod
    def _covered_card(content_dir):
        """An aggregator card linking the upstream repo, like galaxy-core.json."""
        card = {
            "title": "Galaxy Core",
            "description": "Contributions to the core Galaxy platform.",
            "category": "Galaxy Core",
            "links": [
                {
                    "label": "bgruening/galaxytools PRs",
                    "url": "https://github.com/bgruening/galaxytools/pulls?q=is%3Apr",
                },
                {
                    "label": "galaxyproject/galaxy PRs",
                    "url": "https://github.com/galaxyproject/galaxy/pulls?q=is%3Apr",
                },
            ],
            "tags": ["Python"],
            "featured": True,
            "order": 4,
        }
        path = content_dir / "galaxy-core.json"
        path.write_text(json.dumps(card, indent=2) + "\n", encoding="utf-8")
        return path

    @staticmethod
    def _entry(repo, fork_source=None):
        return {
            "repo": repo,
            "title": "Some Title",
            "description": "Some description.",
            "tags": ["Python"],
            "pr_url": f"https://github.com/{repo}/pulls?q=is%3Apr",
            "pr_count": 4,
            "fork_source": fork_source,
        }

    def test_fork_of_covered_repo_creates_no_card(self, tmp_path):
        card = self._covered_card(tmp_path)
        before = card.read_text(encoding="utf-8")

        contributions.update_projects_file(
            {
                "Galaxy Core": [
                    self._entry(
                        "IvoLeist/galaxytools",
                        fork_source="bgruening/galaxytools",
                    )
                ]
            },
            content_dir=str(tmp_path),
        )

        assert not (tmp_path / "galaxytools.json").exists()
        # Skipped outright: no PR link appended to the upstream's card either.
        assert card.read_text(encoding="utf-8") == before

    def test_fork_of_uncovered_repo_still_gets_a_card(self, tmp_path):
        self._covered_card(tmp_path)

        contributions.update_projects_file(
            {
                "Other": [
                    self._entry("someone/unrelated-fork", fork_source="upstream/unrelated-fork")
                ]
            },
            content_dir=str(tmp_path),
        )

        assert (tmp_path / "unrelated-fork.json").exists()

    def test_non_fork_is_unaffected(self, tmp_path):
        self._covered_card(tmp_path)

        contributions.update_projects_file(
            {"Other": [self._entry("conda-forge/nltk_data-feedstock")]},
            content_dir=str(tmp_path),
        )

        assert (tmp_path / "nltk-data-feedstock.json").exists()


class TestGroupPrsByRepo:
    """group_prs_by_repo records the upstream of any fork it encounters."""

    @staticmethod
    def _fetcher(repos):
        """A ContributionsFetcher with github/ai stubbed out (no network)."""
        fetcher = contributions.ContributionsFetcher.__new__(
            contributions.ContributionsFetcher
        )
        fetcher.username = "arash77"
        fetcher.ai_client = None
        fetcher.fork_sources = {}
        fetcher.github = SimpleNamespace(get_repo=lambda name: repos[name])
        return fetcher

    @staticmethod
    def _pr(repo):
        return {"repository_url": f"https://api.github.com/repos/{repo}"}

    def test_records_fork_source(self):
        fetcher = self._fetcher(
            {
                "IvoLeist/galaxytools": SimpleNamespace(
                    private=False,
                    fork=True,
                    source=SimpleNamespace(full_name="bgruening/galaxytools"),
                )
            }
        )

        grouped = fetcher.group_prs_by_repo([self._pr("IvoLeist/galaxytools")])

        assert "IvoLeist/galaxytools" in grouped
        assert fetcher.fork_sources == {
            "IvoLeist/galaxytools": "bgruening/galaxytools"
        }

    def test_non_fork_records_nothing(self):
        fetcher = self._fetcher(
            {
                "galaxyproject/galaxy": SimpleNamespace(
                    private=False, fork=False, source=None
                )
            }
        )

        fetcher.group_prs_by_repo([self._pr("galaxyproject/galaxy")])

        assert fetcher.fork_sources == {}

    def test_fork_with_deleted_upstream_records_nothing(self):
        """`source` is None when the upstream is gone -- must not crash."""
        fetcher = self._fetcher(
            {
                "someone/orphan": SimpleNamespace(
                    private=False, fork=True, source=None
                )
            }
        )

        grouped = fetcher.group_prs_by_repo([self._pr("someone/orphan")])

        assert "someone/orphan" in grouped
        assert fetcher.fork_sources == {}
