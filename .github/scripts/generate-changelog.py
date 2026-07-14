#!/usr/bin/env python3
"""Generate changelog.json from merged PRs for the footer "What's new" popup
(issue #53).

Built from merged PR titles rather than hand-maintained, so it can't go
stale — but a PR that only touched .github/** is a CI/repo change, not
something an end user would recognize as "new in the app", so those are
filtered out.

Shared by the Pages deploy and Docker build workflows so the generator only
ever needs to be fixed in one place (issue #165). Requires the `gh` CLI to
be authenticated (GH_TOKEN env var).
"""
import argparse
import json
import subprocess


def fetch_merged_prs(repo, limit):
    result = subprocess.run(
        ['gh', 'pr', 'list', '--repo', repo, '--state', 'merged', '--limit', str(limit),
         '--json', 'number,title,mergedAt,url'],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def pr_files(pr_number):
    result = subprocess.run(
        ['gh', 'pr', 'view', str(pr_number), '--json', 'files', '-q', '.files[].path'],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.splitlines()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, help='owner/repo, e.g. ${{ github.repository }}')
    parser.add_argument('--limit', type=int, default=200)
    parser.add_argument('--output', default='changelog.json')
    args = parser.parse_args()

    prs = fetch_merged_prs(args.repo, args.limit)

    entries = []
    for pr in prs:
        files = pr_files(pr['number'])
        if files and all(p.startswith('.github/') for p in files):
            continue
        entries.append({
            'number': pr['number'],
            'title': pr['title'],
            'mergedAt': pr['mergedAt'],
            'url': pr['url'],
        })

    entries.sort(key=lambda e: e['mergedAt'], reverse=True)

    with open(args.output, 'w', encoding='utf-8') as out:
        json.dump(entries, out, indent=2, ensure_ascii=False)
        out.write('\n')
    print(f'{args.output} -> {len(entries)} entries')


if __name__ == '__main__':
    main()
