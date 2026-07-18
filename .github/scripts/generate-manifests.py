#!/usr/bin/env python3
"""Generate index.json for one or more preset folders (films/labs/themes).

index.json is the browser's stand-in for a directory listing (static hosting
can't enumerate a folder). Rebuilt by globbing every *.yaml/*.yml file in the
folder; each entry's label is read from the file's own top-level `label:`
line, falling back to a title-cased filename.

Shared by the Pages deploy and Docker build workflows so the generator only
ever needs to be fixed in one place (issue #165).
"""
import argparse
import glob
import json
import os
import re


def label_from_file(path):
    # Cheap top-level "label:" scan — avoids a YAML dep and is safe because
    # label is always a plain scalar on its own line.
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            m = re.match(r'label:\s*(.+?)\s*$', line)
            if m:
                return m.group(1).strip().strip('"\'')
            # Stop at the first list/array item — no top-level label present.
            if line.lstrip().startswith('- '):
                break
    # Fallback: prettify the filename, e.g. "melbourne-labs" -> "Melbourne Labs"
    stem = os.path.splitext(os.path.basename(path))[0]
    return re.sub(r'[-_]+', ' ', stem).title()


def generate_manifest(folder):
    files = sorted(
        os.path.basename(p) for p in glob.glob(f'{folder}/*.yaml') + glob.glob(f'{folder}/*.yml')
    )
    entries = [{'file': f, 'label': label_from_file(os.path.join(folder, f))} for f in files]
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
