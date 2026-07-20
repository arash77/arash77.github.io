#!/usr/bin/env python3
"""
Fetch recent GitHub contributions and update the projects page.
Uses any OpenAI-compatible AI API to create comprehensive project descriptions
based on PR activity. Integrates new contributions into existing categories.

Provider configuration uses two env vars:
``AI_MODELS`` is a simple ordered list of model IDs to try (priority order —
reorder it freely). ``AI_PROVIDERS`` is a JSON array mapping each server to the
model IDs it serves, its base URL, and the env var holding its token. Tokens are
read from the env var each provider names, so no secrets are ever stored here.
"""

import json
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from urllib.parse import urlparse

from github import Auth, Github
from openai import OpenAI


# Built-in default config (public only — no secrets). Each provider names the
# env var holding its token via ``token_env`` and lists the model IDs it serves
# via ``models``. A provider whose token is unset is skipped at runtime.
# Overridden entirely by AI_PROVIDERS (JSON array) / AI_MODELS when set.
DEFAULT_AI_PROVIDERS = [
    {
        "name": "Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "token_env": "GEMINI_TOKEN",
        "models": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    },
    {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "token_env": "OPENROUTER_API_KEY",
        "models": ["google/gemma-4-31b-it:free"],
    },
]

# Simple ordered list of model IDs to try. THIS IS THE PRIORITY ORDER —
# reorder it to change which model is tried first. A model ID that no
# configured provider serves (or whose provider has no token) is skipped.
DEFAULT_AI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "google/gemma-4-31b-it:free",
]


def _load_json(env_var: str, default):
    """Load JSON from an env var, falling back to default on any issue."""
    raw = os.environ.get(env_var, "").strip()
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"  {env_var} is invalid JSON ({exc}); using default")
        return default


def _load_models() -> List[str]:
    """Load the ordered model-ID list from AI_MODELS, or the default list.

    AI_MODELS may be a JSON array of strings (preferred) or a newline/comma-
    separated plain string for easy editing in repo variables.
    """
    raw = os.environ.get("AI_MODELS", "").strip()
    if not raw:
        return list(DEFAULT_AI_MODELS)
    # JSON array of strings takes precedence.
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list) and all(isinstance(x, str) for x in parsed):
            return parsed
    except json.JSONDecodeError:
        pass
    # Plain text fallback: split on newlines and/or commas, drop empties.
    lines = [line.strip() for line in raw.replace(",", "\n").splitlines()]
    return [m for m in lines if m]


class MultiProviderAIClient:
    """AI client that cascades across OpenAI-compatible providers by model ID.

    ``AI_MODELS`` is a simple ordered list of model IDs (priority order).
    ``AI_PROVIDERS`` (JSON array) maps each server to the model IDs it serves,
    its base URL, and the env var holding its token. The client walks the model
    list in order; for each ID it tries every provider that serves it, skipping
    any provider without a token, and returns the first non-empty response. On
    any failure (auth, rate limit, 404, network) it logs and falls through to
    the next provider/model. No secrets are hardcoded; tokens are read from the
    env var each provider names.
    """

    def __init__(self):
        providers = _load_json("AI_PROVIDERS", DEFAULT_AI_PROVIDERS)
        self.providers: List[Dict] = [
            p for p in providers if p.get("name") and p.get("base_url")
        ] if isinstance(providers, list) else []
        self.models = _load_models()
        # Cache one OpenAI client per provider name (keyed on base_url+token).
        self._clients: Dict[str, OpenAI] = {}

    def _client_for(self, provider_cfg: Dict) -> OpenAI:
        key = provider_cfg["name"]
        if key not in self._clients:
            self._clients[key] = OpenAI(
                base_url=provider_cfg["base_url"],
                api_key=os.environ[provider_cfg["token_env"]],
            )
        return self._clients[key]

    def _complete(self, messages: List[Dict]) -> Optional[str]:
        """Run the provider/model cascade and return the first non-empty text.

        Walks ``AI_MODELS`` in order; for each ID tries every provider that
        serves it (skipping providers with no token), returning the first
        non-empty ``message.content``. Logs each attempt. Returns None if every
        model/provider fails or yields empty content.
        """
        if not self.models:
            return None

        for model_id in self.models:
            serving = [p for p in self.providers if model_id in p.get("models", [])]
            if not serving:
                print(f"  [{model_id}] skipped (no provider serves this model)")
                continue

            for provider_cfg in serving:
                name = provider_cfg["name"]
                token_env = provider_cfg.get("token_env", "")
                token = os.environ.get(token_env, "") if token_env else ""
                if not token:
                    print(f"  [{name}/{model_id}] skipped (no token in ${token_env})")
                    continue

                try:
                    client = self._client_for(provider_cfg)
                    # Generous budget: reasoning models spend tokens on internal
                    # thinking before emitting the answer, so a small cap leaves
                    # the visible content empty.
                    response = client.chat.completions.create(
                        model=model_id,
                        messages=messages,
                        temperature=0.7,
                        max_tokens=4000,
                    )
                    content = response.choices[0].message.content
                    if content:
                        print(f"  [{name}] used {model_id}")
                        return content.strip()
                except Exception as exc:
                    print(f"  [{name}] {model_id} failed: {exc}")

        return None

    def generate_project_entry(
        self, repo_name: str, prs: List[Dict]
    ) -> Dict:
        """Generate a complete project card from recent PRs.

        Returns ``{"title", "description", "tags"}`` for a new project card.
        Uses a JSON prompt so the card is complete on first generation; the
        cascade's first parseable JSON object wins. Falls back to a
        slug-derived title, raw text description, and empty tags if no model
        returns parseable JSON.
        """
        pr_details = []
        for pr in prs[:15]:  # Limit to most recent 15
            pr_details.append(
                {
                    "title": pr.get("title", ""),
                    "body": pr.get("body", "")[:300] if pr.get("body") else "",
                    "labels": [label["name"] for label in pr.get("labels", [])],
                    "merged_at": pr.get("merged_at", ""),
                }
            )

        prompt = f"""Based on these recent merged pull requests to {repo_name}, produce a portfolio project card. Return ONLY a JSON object with these keys (no markdown, no prose outside the JSON):

- "title": a short product/project name (2-4 words, Title Case), based on the repo and what it does.
- "description": a concise, professional summary (2-3 sentences, third person) of what the contributor worked on, the technical areas, and the impact.
- "tags": an array of 3-5 short technical tags (TitleCase, e.g. "Python", "Galaxy", "CI/CD", "GitHub Actions", "Automation", "Bioinformatics", "Documentation").

Pull Requests:
{json.dumps(pr_details, indent=2)}"""

        messages = [
            {
                "role": "system",
                "content": "You are a technical writer creating portfolio project cards from GitHub contributions. You always respond with a single JSON object and nothing else.",
            },
            {"role": "user", "content": prompt},
        ]

        raw = self._complete(messages)
        entry = self._parse_entry(raw, repo_name, len(prs))
        return entry

    @staticmethod
    def _parse_entry(
        raw: Optional[str], repo_name: str, pr_count: int
    ) -> Dict:
        """Tolerantly parse a {title,description,tags} JSON object from raw text.

        Models may wrap JSON in prose or reasoning; extract the first balanced
        ``{...}`` block. On any failure, fall back to a safe default card.
        """
        repo_short = repo_name.split("/")[-1]
        fallback_title = repo_short.replace("-", " ").replace("_", " ").title()
        fallback = {
            "title": fallback_title,
            "description": (
                f"Contributed {pr_count} pull request"
                f"{'s' if pr_count != 1 else ''} to improve functionality and "
                f"fix issues."
            ),
            "tags": [],
        }
        if not raw:
            return fallback

        # Find the first '{' ... '}' span (greedy-enough via regex on the
        # outermost braces present in the text).
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            # No JSON block: use the raw text as the description.
            return {
                "title": fallback_title,
                "description": raw.strip(),
                "tags": [],
            }

        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return {
                "title": fallback_title,
                "description": raw.strip(),
                "tags": [],
            }

        title = data.get("title") or fallback_title
        description = data.get("description") or fallback["description"]
        tags = data.get("tags") or []
        if not isinstance(tags, list):
            tags = []
        # Coerce tags to clean strings; drop empties; dedupe preserving order.
        seen: set = set()
        clean_tags: List[str] = []
        for tag in tags:
            if not isinstance(tag, str):
                continue
            t = tag.strip()
            if t and t not in seen:
                seen.add(t)
                clean_tags.append(t)
        return {
            "title": str(title).strip() or fallback_title,
            "description": str(description).strip() or fallback["description"],
            "tags": clean_tags,
        }


class ContributionsFetcher:
    def __init__(self, username: str, token: str):
        self.username = username
        self.github = Github(auth=Auth.Token(token))
        self.ai_client = MultiProviderAIClient()

    def fetch_recent_prs(self, days: int = 30) -> List[Dict]:
        """Fetch recently merged PRs from the past N days."""
        since_date = (datetime.now() - timedelta(days=days)).date()
        query = f"author:{self.username} type:pr is:merged merged:>={since_date}"

        try:
            issues = self.github.search_issues(query, sort="updated", order="desc")
            prs = []
            for issue in issues[:100]:
                prs.append(
                    {
                        "title": issue.title,
                        "body": issue.body,
                        "repository_url": issue.repository.url,
                        "labels": [{"name": label.name} for label in issue.labels],
                        "merged_at": (
                            issue.closed_at.isoformat() if issue.closed_at else None
                        ),
                    }
                )
            return prs
        except Exception as e:
            print(f"Error fetching PRs: {e}")
            return []

    def group_prs_by_repo(self, prs: List[Dict]) -> Dict[str, List[Dict]]:
        """Group PRs by repository, excluding user's own repos."""
        grouped = defaultdict(list)

        for pr in prs:
            repo_url = pr["repository_url"]
            repo_full_name = repo_url.replace("https://api.github.com/repos/", "")

            # Skip PRs to user's own repositories
            if repo_full_name.startswith(f"{self.username}/"):
                continue

            # Skip private repositories
            try:
                if self.github.get_repo(repo_full_name).private:
                    print(f"  Skipping private repo: {repo_full_name}")
                    continue
            except Exception:
                continue

            grouped[repo_full_name].append(pr)

        return dict(grouped)

    def categorize_repo(self, repo: str) -> str:
        """Categorize a repository into an existing section."""
        repo_lower = repo.lower()

        if any(
            x in repo_lower
            for x in [
                "galaxyproject/galaxy",
                "bgruening/galaxytools",
                "galaxyproject/galaxy-hub",
                "galaxyproject/galaxy-visualizations",
                "galaxyproject/tools-iuc",
                "galaxyproject/planemo",
                "bgruening/docker-galaxy",
            ]
        ):
            return "Galaxy Core"
        elif any(x in repo_lower for x in ["training-material", "galaxyecology"]):
            return "Galaxy Training"
        elif any(x in repo_lower for x in ["usegalaxy-eu/", "vgcn"]):
            return "UseGalaxy.eu"
        elif "research-software-ecosystem" in repo_lower:
            return "Bioinformatics"
        else:
            return "Other"

    def generate_project_entries(
        self, prs_by_repo: Dict[str, List[Dict]]
    ) -> Dict[str, List[Dict]]:
        """Generate project entries categorized by section."""
        if not prs_by_repo:
            return {}

        categorized = defaultdict(list)

        for repo, prs in sorted(
            prs_by_repo.items(), key=lambda x: len(x[1]), reverse=True
        ):
            print(f"Generating card for {repo}...")

            # Generate AI card fields (title, description, tags). When no AI
            # client is configured, generate_project_entry returns a safe
            # default card so the workflow still produces a file.
            if self.ai_client:
                ai_entry = self.ai_client.generate_project_entry(repo, prs)
            else:
                ai_entry = MultiProviderAIClient._parse_entry(None, repo, len(prs))

            # Get PR URL for display
            pr_url = f"https://github.com/{repo}/pulls?q=is%3Apr+author%3A{self.username}+is%3Amerged"

            # Categorize
            category = self.categorize_repo(repo)

            # Create entry in the same format as existing ones
            entry = {
                "repo": repo,
                "title": ai_entry["title"],
                "description": ai_entry["description"],
                "tags": ai_entry["tags"],
                "pr_url": pr_url,
                "pr_count": len(prs),
            }

            categorized[category].append(entry)

        return dict(categorized)


VALID_CATEGORIES = [
    "Bioinformatics",
    "Python Projects",
    "Galaxy Core",
    "Galaxy Training",
    "UseGalaxy.eu",
    "Python Libraries",
    "Crypto",
    "Other",
]


def _slug(text: str) -> str:
    """Convert text to a filename-safe slug."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def update_projects_file(
    categorized_entries: Dict[str, List[Dict]],
    content_dir: str = "src/content/projects",
):
    """Update Astro content collection JSON files with new contributions.

    Coverage-aware: a repo already referenced by an existing card (via its
    ``links`` URLs or named in an existing card's ``description`` text) is not
    given a new card. Instead, if the covering card has no PR-search link for
    that repo, one is appended (purely additive — title/description/tags/order
    /featured are never touched). A repo with no existing coverage gets a new
    per-repo card with AI-generated title/description/tags, ``featured: false``,
    and ``order: 99`` (sorts after curated cards; the user reorders on review).
    """
    if not categorized_entries:
        print("No new contributions to add")
        return

    os.makedirs(content_dir, exist_ok=True)

    # Build a coverage index from existing files. A repo is "covered" if either:
    #   (a) it appears as an org/repo path in some card's ``links`` URLs, or
    #   (b) its category already has a card — aggregated area cards (e.g.
    #       galaxy-core.json) are meant to cover a whole category, so a new
    #       repo in an existing category doesn't get its own card.
    # The covering file is the first card (sorted by filename) in that category,
    # or the exact-linking file when (a) applies.
    repo_to_file: Dict[str, str] = {}
    files_data: Dict[str, Dict] = {}
    category_to_file: Dict[str, str] = {}

    for fname in sorted(os.listdir(content_dir)):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(content_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        files_data[fpath] = data
        cat = data.get("category")
        if isinstance(cat, str):
            category_to_file.setdefault(cat, fpath)
        for link in data.get("links", []):
            if not isinstance(link, dict):
                continue
            url = link.get("url", "")
            parsed = urlparse(url)
            if parsed.hostname == "github.com":
                path_parts = parsed.path.lstrip("/").split("/")
                if len(path_parts) >= 2:
                    repo_to_file.setdefault(
                        f"{path_parts[0]}/{path_parts[1]}".lower(), fpath
                    )

    def _covering_file(repo_name: str, category: str) -> Optional[str]:
        """File that covers this repo, by exact link or by category."""
        return repo_to_file.get(repo_name.lower()) or category_to_file.get(category)

    def _has_pr_link(data: Dict, repo_name: str) -> bool:
        """True if the card already links a PR-search URL for this repo."""
        for link in data.get("links", []):
            if not isinstance(link, dict):
                continue
            url = link.get("url", "")
            if repo_name in url and "/pulls?" in url:
                return True
        return False

    modified = False

    for raw_category, entries in categorized_entries.items():
        category = raw_category
        if category not in VALID_CATEGORIES:
            category = "Other"

        for entry in entries:
            repo_name = entry["repo"]
            repo_short = repo_name.split("/")[-1]
            pr_url = entry["pr_url"]
            pr_count = entry.get("pr_count", 1)

            covering = _covering_file(repo_name, category)
            if covering:
                # Already covered: don't create a card. Only add a PR-search
                # link to the covering file if it lacks one (additive).
                data = files_data.get(covering)
                if data is not None and not _has_pr_link(data, repo_name):
                    data.setdefault("links", []).append(
                        {"label": f"{repo_name} PRs", "url": pr_url}
                    )
                    with open(covering, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                        f.write("\n")
                    modified = True
                    print(
                        f"➕ Added {repo_name} PR link to {os.path.basename(covering)}"
                    )
                else:
                    print(f"⏭️  Skipping {repo_name} - already covered")
                continue

            # Not covered anywhere: create a new per-repo card.
            slug = _slug(repo_short)
            # Avoid collisions by appending org prefix if slug exists.
            fpath = os.path.join(content_dir, f"{slug}.json")
            if os.path.exists(fpath):
                slug = _slug(repo_name.replace("/", "-"))
                fpath = os.path.join(content_dir, f"{slug}.json")

            project_data = {
                "title": entry.get("title") or repo_short.replace("-", " ").replace("_", " ").title(),
                "description": entry["description"],
                "category": category,
                "links": [
                    {"label": "Repository", "url": f"https://github.com/{repo_name}"},
                    {"label": f"PRs ({pr_count})", "url": pr_url},
                ],
                "tags": entry.get("tags", []),
                "featured": False,
                "order": 99,
            }

            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(project_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

            # Record coverage so later entries in the same run don't duplicate.
            repo_to_file[repo_name.lower()] = fpath
            files_data[fpath] = project_data
            modified = True
            print(f"✅ Created {fpath} for {repo_name} ({category})")

    if modified:
        print(f"\n✅ Content collection updated in {content_dir}/")
    else:
        print("\n⏭️  No changes needed - all contributions already documented")


def main():
    username = os.environ.get("GITHUB_USERNAME", "arash77")
    token = os.environ.get("GITHUB_TOKEN")

    if not token:
        print("Error: GITHUB_TOKEN is not set")
        return

    print(f"Fetching contributions for {username}...")

    fetcher = ContributionsFetcher(username, token)

    # Fetch PRs from last 30 days
    recent_prs = fetcher.fetch_recent_prs(days=30)
    print(f"Found {len(recent_prs)} recent merged PRs")

    if recent_prs:
        # Group by repository
        prs_by_repo = fetcher.group_prs_by_repo(recent_prs)
        print(f"Contributions to {len(prs_by_repo)} repositories")

        # Generate project entries with AI descriptions
        project_entries = fetcher.generate_project_entries(prs_by_repo)

        # Update the Astro content collection
        update_projects_file(project_entries)

        print("✅ Contribution update complete!")
    else:
        print("No new contributions found in the last 30 days")


if __name__ == "__main__":
    main()
