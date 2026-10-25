# Release parity for v0.3.5.74 — 2026-10-25

Documentation and read-only verification only. No Foundry access, no installation, no provider call, no world write, no runtime/test/template/style/lang edit, no push, merge, PR or publication.

- Worktree: `/home/jtf/orca/workspaces/simplyPF2e/wp3-parity-runbook`
- Branch: `simplyjaytea/wp3-parity-runbook`; base `d0ec85e` (PR #114 merge)
- Worker: WP3. Method mirrors [c01 §3](chunks-2026-10-17/c01.md).

## 1. Result

| Area | Result |
| --- | --- |
| v0.3.5.74 public artifacts | Verified: tag, `main`, PR #114 merge, commit tree, official digests, archive-to-merge entry parity (63 entries, byte-identical). |
| Installation | **Not verified.** Last recorded installation remains v0.3.5.72. |
| Gate | `node tools/check.mjs` exit 0 on Node 26.12.1 (unchanged code); `git diff --check` clean. |
| Native QA | None performed. Ledger rows R01, R02, R06, R07, R21, N01 remain OPEN. |

## 2. Public records

| Check | Source | Result |
| --- | --- | --- |
| Latest release | `GET repos/simplyjaytea/simplyPF2e/releases/latest` | `v0.3.5.74`; target `d0ec85eb3f4efce5def730721e8b939b6f482bd4`; published `2026-10-17T16:54:41Z`; not draft; not prerelease |
| Tag | `GET git/ref/tags/v0.3.5.74` | commit `d0ec85eb3f4efce5def730721e8b939b6f482bd4` |
| `main` | `GET git/ref/heads/main` | commit `d0ec85eb3f4efce5def730721e8b939b6f482bd4` |
| PR #114 | `GET pulls/114` | merged `2026-10-17T16:53:47Z`; merge commit `d0ec85eb3f4efce5def730721e8b939b6f482bd4`; head `d9c61b09b6923b8ac445ffcd6b54187ed094ad7c`; base `feeeec605bfb23077cc210bcbd718467d5375807` |
| Merge parents | local `git log -1 --format='%H %P' d0ec85e…` | `feeeec605bfb23077cc210bcbd718467d5375807` (PR #113 merge) and `d9c61b09…` (completion chunks C01–C13 plus six P2 fixes); `git merge-base --is-ancestor d9c61b09…` succeeds |
| Commit tree | `GET commits/d0ec85e…` and local `d0ec85e…^{tree}` | both `70768dd1a153361c44a31c1a2df961329dc2fb15` |
| Release pipeline | `GET actions/runs/39051396149` and its jobs | Auto Release run `39051396149` on `d0ec85e…`: success. Jobs `verify`, `compute-version`, `release / verify`, `release / build`: all success |

## 3. v0.3.5.74 artifact verification

### 3.1 Assets

Downloaded from `https://github.com/simplyjaytea/simplyPF2e/releases/download/v0.3.5.74/` into the new empty directory `/tmp/wp3-parity/dl` (`gh` was not used; it hangs on this machine). Compared with the API `digest` fields and sizes.

| Asset | Bytes (API = downloaded) | sha256 (API = recomputed) |
| --- | --- | --- |
| `module.json` | 1210 | `50dd2895580e52dc26bade67aa0a2b9bdfeac109c0bacb4e7810c93506e8f9d7` |
| `module.zip` | 336308 | `fbb5e1ab665e70ad99b622830fb6d50e43fa98e1d5dbea565fbc594b4b35e86a` |

Stamped manifest (from the downloaded `module.json`):

- version: `0.3.5.74`
- manifest: `https://github.com/simplyjaytea/simplyPF2e/releases/latest/download/module.json`
- download: `https://github.com/simplyjaytea/simplyPF2e/releases/download/v0.3.5.74/module.zip`
- compatibility: Foundry minimum and verified `14`; pf2e relationship minimum `8.4.1`

### 3.2 Archive-to-merge parity

Method (mirroring c01 §3.3):

1. Downloaded `module.zip` into `/tmp/wp3-parity/dl` and extracted it into the new empty directory `/tmp/wp3-parity/zipextract`.
2. Generated the expected entry list from `git ls-tree -r --name-only d0ec85e`, filtered to the workflow's selection (`module.json`, `LICENSE`, `README.md`, then `lang/`, `scripts/`, `styles/`, `templates/` excluding `*.test.mjs`), sorted. No `.gitattributes` export rules apply.
3. Compared the entry lists, then compared every extracted file byte-for-byte against `git show d0ec85e:<path>`, stamping `module.json` with the same `jq` expression as `.github/workflows/release.yml` lines 97–100.

Output:

```
PASS module.json asset digest matches API digest (50dd2895…)
PASS module.zip asset digest matches API digest (fbb5e1ab…)
expected archive entries: 63
PASS release archive entry list equals expected list (63 entries)
PASS no *.test.mjs entries in release archive
PASS no tests/, tools/, or docs/ entries in release archive
PASS every extracted file byte-identical to the merge tree (63 files), including stamped module.json
zip container bytes: not compared (timestamps/order); entry-level parity is the criterion
```

Composition of the 63 entries: `lang` 1, `scripts` 50, `styles` 1, `templates` 8, and top-level `LICENSE`, `README.md`, `module.json`.

Archive-vs-tree comparison result: the comparison was made after applying the same `jq` stamp as `release.yml` (lines 97–100) to the tree's `module.json`. Against the raw tree (`d0ec85e:module.json`), `module.json` differs only by `version` (`0.3.5.52` to `0.3.5.74`) and `download` (the expected stamp); its `manifest` value is unchanged. All other 62 entries are identical. After the stamp, all 63 entries are byte-identical to the archive.

### 3.3 Limits

- Digests are GitHub-computed. Local recomputation matches them; that does not independently attest the build.
- Parity shows the published archive equals the merge tree under the workflow's selection and stamp. It does not show what Foundry installed.
- Installed version and installed-byte parity are unverified. No Foundry access was available; last recorded installation remains v0.3.5.72.

## 4. Gate

- `node tools/check.mjs` (Node 26.12.1): exit 0; 50 scripts, 109 regression files, 1 tooling file; manifest/localization JSON passed.
- `git diff --check`: clean.
