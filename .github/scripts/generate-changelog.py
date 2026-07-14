#!/usr/bin/env python3
"""Generate changelog.json from merged PRs for the footer "What's new" popup
(issue #53).

Built from merged PR titles rather than hand-maintained, so it can't go
stale — but a PR that only touched .github/** is a CI/repo change, not
something an end user would recognize as "new in the app", so those are
filtered out.

Fetches merged PRs and each PR's changed files in a single paginated GraphQL
query (2-4 requests for up to 200 PRs) rather than one `gh pr view` call per
PR, which used to mean ~200 sequential API round trips (issue #164).

Shared by the Pages deploy and Docker build workflows so the generator only
ever needs to be fixed in one place (issue #165). Requires the `gh` CLI to
be authenticated (GH_TOKEN env var).
"""
import argparse
import json
import subprocess

PAGE_SIZE = 100

QUERY = """
query($owner: String!, $repo: String!, $pageSize: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(states: MERGED, first: $pageSize, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        mergedAt
        url
        files(first: 100) {
          pageInfo { hasNextPage }
          nodes { path }
        }
      }
    }
  }
}
"""


def fetch_merged_prs(repo, limit):
    owner, name = repo.split('/', 1)
    prs = []
    cursor = None
    while len(prs) < limit:
        args = [
            'gh', 'api', 'graphql',
            '-f', f'query={QUERY}',
            '-F', f'owner={owner}',
            '-F', f'repo={name}',
            '-F', f'pageSize={min(PAGE_SIZE, limit - len(prs))}',
        ]
        if cursor:
            args += ['-F', f'cursor={cursor}']
        result = subprocess.run(args, capture_output=True, text=True, check=True)
        connection = json.loads(result.stdout)['data']['repository']['pullRequests']
        prs.extend(connection['nodes'])
        if not connection['pageInfo']['hasNextPage']:
            break
        cursor = connection['pageInfo']['endCursor']
    return prs[:limit]


def is_github_only(pr):
    files = pr['files']['nodes']
    if not files:
        return False
    all_github = all(f['path'].startswith('.github/') for f in files)
    if all_github and pr['files']['pageInfo']['hasNextPage']:
        # First 100 files were all .github/**, but there are more we didn't
        # fetch — can't be sure the rest are too, so don't filter it out.
        return False
    return all_github


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, help='owner/repo, e.g. ${{ github.repository }}')
    parser.add_argument('--limit', type=int, default=200)
    parser.add_argument('--output', default='changelog.json')
    args = parser.parse_args()

    prs = fetch_merged_prs(args.repo, args.limit)

    entries = [
        {
            'number': pr['number'],
            'title': pr['title'],
            'mergedAt': pr['mergedAt'],
            'url': pr['url'],
        }
        for pr in prs
        if not is_github_only(pr)
    ]

    entries.sort(key=lambda e: e['mergedAt'], reverse=True)

    with open(args.output, 'w', encoding='utf-8') as out:
        json.dump(entries, out, indent=2, ensure_ascii=False)
        out.write('\n')
    print(f'{args.output} -> {len(entries)} entries')


if __name__ == '__main__':
    main()
