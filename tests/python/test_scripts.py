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


class TestUnservedModelWarning:
    """AI_MODELS entries no provider serves must be called out at startup.

    The 2026-09 run had `gemini-3.7-flash` and `gemini-3.6-flash` at the top of
    AI_MODELS while AI_PROVIDERS listed neither, so the stated first choice was
    silently demoted and every card came from the third model down.
    """

    PROVIDERS = json.dumps(
        [
            {
                "name": "Gemini",
                "base_url": "https://example.invalid/v1/",
                "token_env": "GEMINI_TOKEN",
                "models": ["gemini-3.5-flash"],
            }
        ]
    )

    def _client(self, monkeypatch, models, actions=False):
        monkeypatch.setenv("AI_PROVIDERS", self.PROVIDERS)
        monkeypatch.setenv("AI_MODELS", models)
        monkeypatch.setenv("GITHUB_ACTIONS", "true" if actions else "")
        return contributions.MultiProviderAIClient()

    def test_names_every_unserved_model(self, monkeypatch, capsys):
        self._client(monkeypatch, "gemini-3.7-flash\ngemini-3.6-flash\ngemini-3.5-flash")

        out = capsys.readouterr().out
        assert "WARNING" in out
        assert "gemini-3.7-flash" in out and "gemini-3.6-flash" in out
        assert "2 of 3" in out
        # The served model must not be reported as missing.
        assert out.count("gemini-3.5-flash") == 0

    def test_silent_when_every_model_is_served(self, monkeypatch, capsys):
        self._client(monkeypatch, "gemini-3.5-flash")

        assert capsys.readouterr().out == ""

    def test_emits_an_annotation_under_actions(self, monkeypatch, capsys):
        self._client(monkeypatch, "gemini-3.7-flash", actions=True)

        assert "::warning::" in capsys.readouterr().out

    def test_no_annotation_outside_actions(self, monkeypatch, capsys):
        self._client(monkeypatch, "gemini-3.7-flash")

        out = capsys.readouterr().out
        assert "WARNING" in out
        assert "::warning::" not in out
