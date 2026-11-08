# Project and onboarding
Evidence: `src/main.ts`, `src/studio/project.ts`.

## STORY-001: Start a named story
**Type**: short
**Topic**: Project and onboarding
**Persona**: Maya, a first-time illustrator.
**Goal**: Begin an empty project named Forest Walk.
**Preconditions**: Studio open in a browser with IndexedDB available.
**Ideal path**: 2 — choose New and name it.
**Alternate paths**: Start editing the default My New Story; rename it later via Project > Rename project.
### Steps
1. Click ＋ New -> the Project title prompt opens.
2. Enter Forest Walk and confirm -> a new blank project and scene open.
3. Read the empty preview -> it prompts Maya to import artwork in Arrange.
### Variations
- Cancel the title prompt: remain in the current project.
### Edge Cases
- Empty title: creation falls back to Untitled Story.

## STORY-002: Save and return to a local project
**Type**: short
**Topic**: Project and onboarding
**Persona**: Leo, a returning creator.
**Goal**: Persist a scene and find it again.
**Preconditions**: A project has unsaved edits.
**Ideal path**: 2 — save and reopen the project.
**Alternate paths**: Switching projects also saves the current project before switching.
### Steps
1. Click Save -> status changes through Saving… to Saved locally.
2. Reload the page -> the saved project is restored.
3. In Story, select another project from PROJECTS and return -> the saved project opens.
### Variations
- Switching projects saves the current project first.
### Edge Cases
- IndexedDB failure: Save failed is shown; do not assume the work was saved.

## STORY-003: Open a supplied project file
**Type**: short
**Topic**: Project and onboarding
**Persona**: Nina, receiving an existing `.story.json` file.
**Goal**: Continue editing a previously packaged story.
**Preconditions**: A valid project file is available locally.
**Ideal path**: 2 — Open and choose the file.
**Alternate paths**: Open Vinny example from Project loads the built-in sample, not an arbitrary file.
### Steps
1. Click Open -> the project file picker appears.
2. Choose the `.story.json` -> the project is validated and opened as an imported copy.
3. Inspect Story's scene list -> imported scenes appear.
### Variations
- A supported portable package may include assets.
### Edge Cases
- Invalid JSON or unsupported package: an error is shown; the current project is not replaced.

## STORY-004: Explore the example safely
**Type**: short
**Topic**: Project and onboarding
**Persona**: Maya, looking for an example before importing artwork.
**Goal**: Inspect a populated sample without losing her current work.
**Preconditions**: Studio is open.
**Ideal path**: 2 — choose the example and inspect it.
**Alternate paths**: Open an existing project file.
### Steps
1. Open Project -> choose Open Vinny example.
2. Inspect its scene and preview -> the example opens as a separate project.
3. Select the earlier project under Story > PROJECTS -> return to it.
### Variations
- Save changes to the example as a local project.
### Edge Cases
- Opening the example first persists the previous project; storage errors may prevent switching.

## STORY-005: Duplicate, rename and delete a local project
**Type**: medium
**Topic**: Project and onboarding
**Persona**: Leo, making a safe alternate cut.
**Goal**: Experiment on a copy, then remove it.
**Preconditions**: An existing project is open.
**Ideal path**: 4 — duplicate, rename, choose delete and confirm.
**Alternate paths**: ＋ New creates a blank project rather than copying existing content.
### Steps
1. Open Project -> choose Duplicate project to create a copy.
2. Open Project -> choose Rename project and name it Forest Test.
3. Make a small edit and click Save -> the copy is stored locally.
4. Open Project -> choose Delete project.
5. Confirm deletion -> the copy is removed from browser storage and another project opens.
### Variations
- Cancel deletion: the project remains.
### Edge Cases
- Deleting the last stored project opens a new Untitled Story; deleting is local to this browser.
