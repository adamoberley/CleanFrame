# Third-party notices

The root MIT licence covers CleanFrame's original code and documentation. Third-party material retains the terms below. Keep these notices and the adjacent licence texts when sharing source or a build.

## Fonts

| Material | Terms and source record |
| --- | --- |
| Inter 4.1 | SIL Open Font License 1.1; `app/assets/inter-OFL.txt`. Source: [rsms/inter v4.1](https://github.com/rsms/inter/releases/tag/v4.1) |

Inter is the only font in the app and in exports.

## Icons and trademarks

| Material | Provenance and terms |
| --- | --- |
| Simple Icons service marks | CC0; exact revisions and adaptations in `app/assets/icons/SOURCES.json` and `ADDITIONAL-SOURCES.json`. The CC0 text is retained beside the icons. |
| Disney+, ABC and SBS marks | [Custom Brand Icons](https://github.com/elax46/custom-brand-icons), MIT. The retained licence is `app/assets/icons/CUSTOM-BRAND-ICONS-LICENSE.txt`. ABC and SBS sources were replaced during the public-source review. Exact revisions, source files and extraction/recolour notes are in `SOURCES.json`. |
| ESPN wordmark | [Wikimedia Commons source](https://commons.wikimedia.org/wiki/File:ESPN_wordmark.svg), identified there as public-domain text/logo geometry. White PNG derived from the retained path; provenance and source hash in `ADDITIONAL-SOURCES.json`. ESPN retains trademark rights. |
| Home and Live TV outlines, inline utility icons | Original CleanFrame drawings, covered by the project's MIT licence. |

Brand marks identify services. Their owners retain trademark rights; this project claims no endorsement or affiliation.

## Photographs

This personal fork ships no photographs. Earlier bundled wallpapers and their credits remain in Git history under their original terms. Owner-selected Art Mode photos are read locally into private caches and are never included in source or exported widgets. Owners retain responsibility for their photo rights.

## Development dependencies and exports

Development dependencies retain the licences in their npm packages. They are not copied into the TV JavaScript runtime.

`npm run export:public` includes this notice and the root MIT licence. Preserve the included font and icon licence texts. Review [public release preparation](docs/public-release.md) before publishing a repository or download.
