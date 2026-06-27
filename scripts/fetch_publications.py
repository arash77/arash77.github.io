#!/usr/bin/env python3
import json
import os
import re
import urllib.request
import urllib.parse
from typing import Dict, Optional

ORCID_ID = "0009-0006-2228-8123"
OUTPUT_FILE = "src/data/conferences.json"


def normalize_title(title: str) -> str:
    """Normalize a title for grouping duplicates (lowercase, alphanumeric only)."""
    return re.sub(r"[^a-z0-9]", "", title.lower())


def get_json(url: str, headers: Optional[Dict[str, str]] = None) -> Optional[dict]:
    """Helper to fetch JSON from a URL with custom headers."""
    req = urllib.request.Request(url)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status == 200:
                return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"Error fetching {url}: {e}")
    return None


def fetch_crossref_metadata(doi: str) -> Optional[dict]:
    """Fetch publication metadata from Crossref by DOI."""
    # Use the 'polite' pool by identifying ourselves
    headers = {
        "User-Agent": "PublicationsFetcher/1.0 (mailto:arash.kadkhodaei@gmail.com)"
    }
    url = f"https://api.crossref.org/works/{urllib.parse.quote(doi)}"
    data = get_json(url, headers)
    if data and data.get("status") == "ok":
        return data.get("message")
    return None


def fetch_orcid_work_detail(orcid_id: str, put_code: str) -> Optional[dict]:
    """Fetch detailed work info from ORCID by put-code."""
    headers = {"Accept": "application/json"}
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/work/{put_code}"
    return get_json(url, headers)


def map_orcid_type(orcid_type: str) -> str:
    """Map ORCID work type to a standard user-facing type."""
    type_map = {
        "conference-presentation": "Presentation",
        "conference-poster": "Poster",
        "journal-article": "Paper",
        "preprint": "Preprint",
        "book-chapter": "Book Chapter",
        "book": "Book",
    }
    return type_map.get(orcid_type.lower(), orcid_type.replace("-", " ").title())


def main():
    print(f"Fetching ORCID works for {ORCID_ID}...")
    headers = {"Accept": "application/json"}
    orcid_url = f"https://pub.orcid.org/v3.0/{ORCID_ID}/works"
    orcid_data = get_json(orcid_url, headers)

    if not orcid_data:
        print("Failed to fetch works from ORCID. Exiting.")
        return

    groups = orcid_data.get("group", [])
    print(f"Found {len(groups)} work groups on ORCID.")

    raw_publications = []

    for idx, group in enumerate(groups, 1):
        summaries = group.get("work-summary", [])
        if not summaries:
            continue

        # Use the first summary as the primary reference in the group
        summary = summaries[0]
        put_code = summary.get("put-code")
        title = summary.get("title", {}).get("title", {}).get("value", "")
        work_type = summary.get("type", "")
        mapped_type = map_orcid_type(work_type)

        # Get publication year
        pub_date = summary.get("publication-date")
        year = None
        if pub_date and pub_date.get("year"):
            year = pub_date.get("year", {}).get("value")

        # Extract DOI if present
        doi = None
        ext_ids = summary.get("external-ids", {}).get("external-id", [])
        for ext_id in ext_ids:
            if ext_id.get("external-id-type") == "doi":
                doi = ext_id.get("external-id-value")
                break

        print(f"[{idx}/{len(groups)}] Processing: {title}")

        contributors = []

        # Attempt to enrich using Crossref if DOI is available
        if doi:
            print(f"  Attempting to fetch Crossref metadata for DOI: {doi}")
            cr_meta = fetch_crossref_metadata(doi)
            if cr_meta:
                # Use enriched title if available
                titles = cr_meta.get("title", [])
                if titles:
                    title = titles[0]

                # Use enriched year if available
                issued = cr_meta.get("issued", {})
                date_parts = issued.get("date-parts", [])
                if date_parts and date_parts[0] and date_parts[0][0]:
                    year = str(date_parts[0][0])

                # Use enriched authors/contributors
                authors = cr_meta.get("author", [])
                for author in authors:
                    given = author.get("given", "").strip()
                    family = author.get("family", "").strip()
                    name = f"{given} {family}".strip()
                    if name:
                        contributors.append(name)
            else:
                print("  Crossref fetch failed, falling back to ORCID work details.")

        # Fallback to ORCID work details if we don't have contributors yet
        if not contributors and put_code:
            print(f"  Fetching ORCID work details for put-code: {put_code}")
            detail = fetch_orcid_work_detail(ORCID_ID, str(put_code))
            if detail:
                orcid_contribs = detail.get("contributors", {}).get("contributor", [])
                for contrib in orcid_contribs:
                    name = contrib.get("credit-name", {}).get("value", "").strip()
                    if name:
                        contributors.append(name)

        # Default fallbacks if empty
        if not year:
            year = "Unknown"
        if not contributors:
            contributors = ["Arash Kadkhodaei"]

        raw_publications.append(
            {
                "title": title,
                "year": year,
                "type": mapped_type,
                "doi": doi,
                "contributors": contributors,
            }
        )

    # Group publications by normalized title
    grouped_publications = {}

    for pub in raw_publications:
        norm_title = normalize_title(pub["title"])

        if norm_title not in grouped_publications:
            grouped_publications[norm_title] = {
                "title": pub["title"],
                "year": pub["year"],
                "types": [pub["type"]],
                "dois": [],
                "contributors": pub["contributors"],
            }
            if pub["doi"]:
                grouped_publications[norm_title]["dois"].append(
                    {"label": pub["doi"], "href": f"https://doi.org/{pub['doi']}"}
                )
        else:
            entry = grouped_publications[norm_title]
            # Add type if not already present
            if pub["type"] not in entry["types"]:
                entry["types"].append(pub["type"])
            # Add DOI if not already present
            if pub["doi"]:
                doi_href = f"https://doi.org/{pub['doi']}"
                if not any(d["href"] == doi_href for d in entry["dois"]):
                    entry["dois"].append({"label": pub["doi"], "href": doi_href})
            # If our current record has a longer contributor list, use that
            if len(pub["contributors"]) > len(entry["contributors"]):
                entry["contributors"] = pub["contributors"]

    # Convert to list and clean up sorting/formatting
    final_publications = []
    for entry in grouped_publications.values():
        # Sort types for consistency (e.g. ['Presentation', 'Poster'])
        entry["types"].sort()
        # Sort DOIs by label
        entry["dois"].sort(key=lambda d: d["label"])
        final_publications.append(entry)

    # Sort final publications: Year (descending), then Title (ascending)
    final_publications.sort(key=lambda x: (x["year"], x["title"]), reverse=True)
    # Ensure year sorting is fully reversed (newest first), but titles within a year are alphabetical
    # To do that, we sort by title ascending first, then by year descending:
    final_publications.sort(key=lambda x: x["title"])
    final_publications.sort(key=lambda x: x["year"], reverse=True)

    # Write out the JSON
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(final_publications, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(
        f"Successfully updated {OUTPUT_FILE} with {len(final_publications)} grouped publications."
    )


if __name__ == "__main__":
    main()
