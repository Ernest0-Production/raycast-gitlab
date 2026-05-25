## Learned User Preferences

- When changing this Raycast GitLab extension, preserve existing code style and structure; do not refactor unrelated patterns or drift from local conventions.
- Run requested terminal, lint, and Raycast dev/debug commands yourself when asked instead of only describing them.

## Learned Workspace Facts

- Search Merge Requests UI lives in `src/components/mr_search.tsx` (entry `src/mr_search.tsx`); the AI tool is `src/tools/search-merge-requests.ts` and is separate from the List UI.
- Search Merge Requests uses `MyProjectsDropdown` with `includeAllItem={false}`: only concrete repositories, no "All Projects"; a project must be selected before MRs load.
- Search Merge Requests groups MRs into "Created by me" (section hidden when empty) and "Other".
- `MyProjectsDropdown` in `src/components/project.tsx` supports `includeAllItem` (default `true`); My Merge Requests and Reviews keep "All Projects".
- MR list metadata panel uses `useMRListDetails()` and `MRListDetailsToggleAction` (shortcut ⌘⇧D); the former `listdetails` preference was removed from `package.json`.
