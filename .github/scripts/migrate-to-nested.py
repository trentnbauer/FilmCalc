#!/usr/bin/env python3
"""One-off migration: flat multi-entry films/*.yaml and labs/*.yaml into the
nested, one-entry-per-file layout (Phase B of the films/labs data-layout
migration — see the plan discussed for the "Push to GitHub" feature and
fork/merge-friction reduction).

For each source film file, splits every film's `bundles` by `storeName`
into its own file (a film sold by 3 stores in Melbourne becomes 3 files),
dropping the file-level label/country/state/city fields (the new folder
path carries that instead — see DATA_SPEC.md's folder-path convention).
For each source lab file, one file per lab, its full `services:` list kept
intact (labs have no bundle-style merge — see js/modals.js's
`applyParsedImport`, `saved[l.name] = l` overwrites wholesale).

Deletes the original flat files once every entry from them has been
written to its new nested path. Does NOT touch films/index.json or
labs/index.json — run generate-manifests.py after this.

Not part of any workflow; run manually once per source file (see the
`--only` flag) and reviewed before committing.
"""
import argparse
import glob
import os
import re

import yaml


class IndentedDumper(yaml.Dumper):
    # Matches this repo's existing YAML convention (see any films/*.yaml or
    # labs/*.yaml) of indenting block-sequence items two spaces past their
    # parent key, instead of PyYAML's default of aligning them with it.
    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


def slug(text):
    s = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
    return re.sub(r'-{2,}', '-', s)


def unique_path(path):
    if not os.path.exists(path):
        return path
    root, ext = os.path.splitext(path)
    n = 2
    while os.path.exists(f'{root}-{n}{ext}'):
        n += 1
    return f'{root}-{n}{ext}'


def dump(doc, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        yaml.dump(
            doc, f, Dumper=IndentedDumper, default_flow_style=False,
            sort_keys=False, allow_unicode=True, width=100,
        )


def migrate_film_file(path):
    doc = yaml.safe_load(open(path, encoding='utf-8'))
    country, state, city = doc.get('country'), doc.get('state'), doc.get('city')
    if bool(state) != bool(city):
        raise ValueError(f'{path}: has exactly one of state/city set — expected both or neither')
    base_dir = os.path.join('films', slug(country)) if not state else \
        os.path.join('films', slug(country), slug(state), slug(city))

    written = []
    for film in doc.get('films') or []:
        groups = dict()
        for b in film.get('bundles') or []:
            groups.setdefault(b.get('storeName') or 'unknown-store', []).append(b)
        for store, bundles in groups.items():
            new_film = dict()
            for key in ('name', 'boxSpeed', 'maxPushPull', 'process', 'format', 'hidden'):
                if key in film:
                    new_film[key] = film[key]
            new_film['bundles'] = bundles
            # boxSpeed is part of the filename (not just the film name) because
            # the same name can legitimately cover multiple speeds from one
            # store (e.g. "FujiFilm Color" 200 and 400) — without it those
            # would collide and fall back to an unclear "-2.yaml" suffix.
            filename = f"{slug(film['name'])}-{film.get('boxSpeed', 0)}-{slug(store)}.yaml"
            target = unique_path(os.path.join(base_dir, filename))
            dump(new_film, target)
            written.append(target)
    return written


def migrate_lab_file(path):
    doc = yaml.safe_load(open(path, encoding='utf-8'))
    country, state, city = doc.get('country'), doc.get('state'), doc.get('city')
    base_dir = os.path.join('labs', slug(country), slug(state), slug(city))

    written = []
    for lab in doc.get('labs') or []:
        new_lab = dict()
        for key in ('name', 'hidden', 'address', 'phone', 'email', 'website', 'services'):
            if key in lab:
                new_lab[key] = lab[key]
        filename = f"{slug(lab['name'])}.yaml"
        target = unique_path(os.path.join(base_dir, filename))
        dump(new_lab, target)
        written.append(target)
    return written


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', help='Only migrate this one source file (relative path), e.g. films/melbourne-retailers.yaml')
    parser.add_argument('--dry-run', action='store_true', help="Report what would be written/deleted without touching disk")
    args = parser.parse_args()

    sources = [args.only] if args.only else (
        sorted(glob.glob('films/*.yaml')) + sorted(glob.glob('labs/*.yaml'))
    )

    for path in sources:
        folder = path.split(os.sep)[0]
        if args.dry_run:
            doc = yaml.safe_load(open(path, encoding='utf-8'))
            n = len(doc.get('films') or doc.get('labs') or [])
            print(f'{path}: {n} entr(y/ies), would migrate + delete')
            continue
        written = migrate_film_file(path) if folder == 'films' else migrate_lab_file(path)
        os.remove(path)
        print(f'{path} -> {len(written)} file(s):')
        for w in written:
            print(f'  {w}')


if __name__ == '__main__':
    main()
