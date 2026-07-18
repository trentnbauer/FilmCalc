#!/usr/bin/env python3
"""Generate index.json for one or more preset folders (films/labs/themes).

index.json is the browser's stand-in for a directory listing (static hosting
can't enumerate a folder). Rebuilt by walking every *.yaml/*.yml file under
the folder, recursively — films/ and labs/ entries may live several folders
deep, grouped by country/state/city (see DATA_SPEC.md's folder-path
convention). themes/ stays flat.

Label: read from the file's own top-level `label:` line if present, else its
`name:` line (the shape a single-entry film/lab file uses instead), else a
title-cased filename.

Region (films/labs only): read from the file's own top-level
`country:`/`state:`/`city:` lines if present — today's schema, where a
whole (still-flat) file is grouped under one region via those fields. Once
a file's schema drops those fields, region is derived instead from how many
folders deep it sits under `films/`/`labs/`: one segment
(`films/australia/…`) means country-only, three
(`films/australia/victoria/melbourne/…`) means country/state/city.

Shared by the Pages deploy and Docker build workflows so the generator only
ever needs to be fixed in one place (issue #165).
"""
import argparse
import glob
import json
import os
import re

REGION_AWARE_FOLDERS = ('films', 'labs')


def scan_top_level_fields(path):
    """Cheap top-level `key: value` scan — avoids a YAML dep. Safe because
    every field we care about is a plain scalar on its own line, and we stop
    at the first list item (`- `), which is always where a file's per-entry
    list (films:/labs:/bundles:/services:) begins."""
    fields = {}
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            if line.lstrip().startswith('- '):
                break
            m = re.match(r'(\w+):\s*(.+?)\s*$', line)
            if m:
                fields[m.group(1)] = m.group(2).strip('"\'')
    return fields


def label_from(path, fields):
    if fields.get('label'):
        return fields['label']
    if fields.get('name'):
        return fields['name']
    # Fallback: prettify the filename, e.g. "melbourne-labs" -> "Melbourne Labs"
    stem = os.path.splitext(os.path.basename(path))[0]
    return re.sub(r'[-_]+', ' ', stem).title()


def unslug(segment):
    return segment.replace('-', ' ').title()


def region_from(path, folder, fields):
    if fields.get('country'):
        return fields.get('country'), fields.get('state'), fields.get('city')
    rel_dir = os.path.dirname(os.path.relpath(path, folder))
    parts = [p for p in rel_dir.split(os.sep) if p]
    if len(parts) == 1:
        return unslug(parts[0]), None, None
    if len(parts) == 3:
        return unslug(parts[0]), unslug(parts[1]), unslug(parts[2])
    return None, None, None


def generate_manifest(folder):
    region_aware = folder in REGION_AWARE_FOLDERS
    paths = sorted(
        glob.glob(f'{folder}/**/*.yaml', recursive=True) + glob.glob(f'{folder}/**/*.yml', recursive=True)
    )
    entries = []
    for p in paths:
        fields = scan_top_level_fields(p)
        entry = {
            'file': os.path.relpath(p, folder).replace(os.sep, '/'),
            'label': label_from(p, fields),
        }
        if region_aware:
            country, state, city = region_from(p, folder, fields)
            if country:
                entry['country'] = country
            if state:
                entry['state'] = state
            if city:
                entry['city'] = city
        entries.append(entry)
    with open(f'{folder}/index.json', 'w', encoding='utf-8') as out:
        json.dump(entries, out, indent=2, ensure_ascii=False)
        out.write('\n')
    print(f'{folder}/index.json -> {len(entries)} preset(s): ' + ', '.join(e['file'] for e in entries))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folders', nargs='+', help='Preset folders to generate index.json for, e.g. films labs themes')
    args = parser.parse_args()
    for folder in args.folders:
        generate_manifest(folder)


if __name__ == '__main__':
    main()
