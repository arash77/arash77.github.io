#!/usr/bin/env python3
"""
Fetch recent GitHub contributions and update the projects page.
Uses GitHub Models AI to create comprehensive project descriptions based on PR activity.
Integrates new contributions into existing categories.
"""

import json
import os
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from github import Github
from openai import OpenAI


class GitHubModelsClient:
    """Client for GitHub Models AI API."""

    def __init__(self, token: str):
        self.client = OpenAI(
            base_url="https://models.github.ai/inference",
            api_key=token,
        )

    def generate_project_description(
        self, repo_name: str, prs: List[Dict]
    ) -> Optional[str]:
        """Generate a comprehensive project description based on PRs."""

        # Prepare PR details for AI
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

        prompt = f"""Based on these recent pull requests to {repo_name}, write a concise, professional project description (2-3 sentences) that explains:
1. What the contributor worked on
2. The technical areas or features they contributed to
3. The impact or purpose of their contributions

Pull Requests:
{json.dumps(pr_details, indent=2)}

Write ONLY the description text, no additional formatting or labels. Make it sound professional and technical."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a technical writer creating concise project descriptions based on GitHub contributions. Write in third person, focusing on technical impact.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=200,
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            print(f"Warning: AI description generation failed for {repo_name}: {e}")
            return None


class ContributionsFetcher:
    def __init__(self, username: str, token: str):
        self.username = username
        self.github = Github(token)
        self.ai_client = GitHubModelsClient(token)

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
                        "html_url": issue.html_url,
                        "title": issue.title,
                        "body": issue.body,
                        "repository_url": issue.repository.url,
                        "labels": [{"name": label.name} for label in issue.labels],
                        "merged_at": issue.closed_at.isoformat()
                        if issue.closed_at
                        else None,
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
            return "Galaxy Project Core"
        elif any(x in repo_lower for x in ["training-material", "galaxyecology"]):
            return "Galaxy Training & Community"
        elif any(x in repo_lower for x in ["usegalaxy-eu/", "vgcn"]):
            return "UseGalaxy.eu Infrastructure"
        elif "research-software-ecosystem" in repo_lower:
            return "Research Software Ecosystem"
        else:
            return "Other Open-Source Projects"

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
            print(f"Generating description for {repo}...")

            # Generate AI description
            description = self.ai_client.generate_project_description(repo, prs)

            # Fallback description if AI fails
            if not description:
                description = f"Contributed {len(prs)} pull request{'s' if len(prs) > 1 else ''} to improve functionality and fix issues."

            # Get PR URL for display
            pr_url = f"https://github.com/{repo}/pulls?q=is%3Apr+author%3A{self.username}+is%3Amerged"

            # Categorize
            category = self.categorize_repo(repo)

            # Create entry in the same format as existing ones
            entry = {
                "repo": repo,
                "description": description,
                "pr_url": pr_url,
                "pr_count": len(prs),
            }

            categorized[category].append(entry)

        return dict(categorized)


def update_projects_file(
    categorized_entries: Dict[str, List[Dict]],
    file_path: str = "content/projects/index.md",
):
    """Update the projects markdown file by integrating into existing categories."""
    if not categorized_entries:
        print("No new contributions to add")
        return

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Remove the old "Recent Contributions" section if it exists
        if "## 🆕 Recent Contributions" in content:
            start = content.find("## 🆕 Recent Contributions")
            end = content.find("\n---\n\n*Last updated:", start)
            if end != -1:
                # Find the end of the line after "Last updated"
                end = content.find("\n", end + 20)
                if end != -1:
                    content = content[:start].rstrip() + content[end:]
                else:
                    content = content[:start].rstrip()

        modified = False

        for category, entries in categorized_entries.items():
            # Find the category section
            section_pattern = f"### {category}"

            if section_pattern not in content:
                # Category doesn't exist - add it under "Notable Open-Source Contributions"
                notable_section = "## Notable Open-Source Contributions"
                if notable_section in content:
                    insert_pos = content.find(notable_section) + len(notable_section)
                    # Find the end of the line
                    insert_pos = content.find("\n", insert_pos) + 1

                    new_section = f"\n### {category}\n"
                    for entry in entries:
                        new_section += f"- **[{entry['repo']}](https://github.com/{entry['repo']})** - {entry['description']} ([PRs]({entry['pr_url']}))\n"

                    content = content[:insert_pos] + new_section + content[insert_pos:]
                    modified = True
                    print(f"✅ Added new category: {category}")
            else:
                # Category exists - check each entry
                for entry in entries:
                    repo_name = entry["repo"]

                    # Check if repo is already mentioned in this category
                    section_start = content.find(section_pattern)
                    # Find the next ### or ## section
                    next_section = content.find("\n##", section_start + 1)
                    if next_section == -1:
                        section_content = content[section_start:]
                    else:
                        section_content = content[section_start:next_section]

                    # Check if repo already exists anywhere in the document
                    repo_short_name = repo_name.split("/")[-1].lower()

                    # Check for exact URL match
                    if f"github.com/{repo_name}" in content:
                        print(f"⏭️  Skipping {repo_name} - already documented")
                        continue

                    # Check for short name match (but avoid common names like "galaxy", "content", "utils")
                    if repo_short_name not in ["galaxy", "content", "utils", "tools"]:
                        # Look for the short name in links or text
                        import re

                        pattern = (
                            rf"\*\*\[?[^]]*{re.escape(repo_short_name)}[^]]*\]?\*\*"
                        )
                        if re.search(pattern, content, re.IGNORECASE):
                            print(f"⏭️  Skipping {repo_name} - already documented")
                            continue

                    # Add the new entry at the end of this section
                    # Find where to insert (before next ### or ##)
                    insert_pos = section_start + len(section_content)
                    if next_section != -1:
                        insert_pos = next_section

                    new_entry = f"- **[{repo_name}](https://github.com/{repo_name})** - {entry['description']} ([PRs]({entry['pr_url']}))\n"
                    content = content[:insert_pos] + new_entry + content[insert_pos:]
                    modified = True
                    print(f"✅ Added {repo_name} to {category}")

        if modified:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"\n✅ Updated {file_path}")
        else:
            print("\n⏭️  No changes needed - all contributions already documented")

    except Exception as e:
        print(f"Error updating file: {e}")


def main():
    username = os.environ.get("GITHUB_USERNAME", "arash77")
    token = os.environ.get("GITHUB_TOKEN")

    if not token:
        print("Error: GITHUB_TOKEN environment variable not set")
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

        # Update the file
        update_projects_file(project_entries)

        print("✅ Contribution update complete!")
    else:
        print("No new contributions found in the last 30 days")


if __name__ == "__main__":
    main()
