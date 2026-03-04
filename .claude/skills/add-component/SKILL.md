---
description: Add a new React component to Farm Footprint Explorer — establishes responsibility boundaries, writes the RTL test first, then implements, then wires into the parent.
argument-hint: "[component name and purpose, e.g. 'AlertSummary card showing total alert count and date range']"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

You are adding a new React component to Farm Footprint Explorer. The component needed is: $ARGUMENTS

Follow this workflow in order.

## 1. Establish responsibility before writing anything

Answer these questions first:
- **Pure presentational or stateful?** Prefer pure (all data via props) unless there is a clear reason to own state.
- **Who owns the state this component needs?** Check the existing boundary:
  - `routes/index.tsx` — owns all top-level state (mode, geometry, result, isLoading, error)
  - `hooks/useFootprintAnalysis.ts` — owns API communication state
  - New local state is fine for UI-only concerns (open/closed, hover, etc.)
- **Where does it live?** New components go in `frontend/app/components/`. New hooks go in `frontend/app/hooks/`.
- **Does it need API data?** If yes, receive it as props from the parent — don't call the API directly in a component. Never hand-write fetch calls; use the generated client via `useFootprintAnalysis` or a new hook.

## 2. Write the test first (TDD)

Create `frontend/tests/YourComponent.test.tsx` before implementing.

Test the component's behaviour, not its implementation:
- What does it render given valid props?
- What does it render in loading/error/empty states?
- What user interactions does it handle?

Key patterns from the existing test suite:
```typescript
import { render, screen } from '@testing-library/react'
import { YourComponent } from '../app/components/YourComponent'

describe('YourComponent', () => {
  it('renders the alert count', () => {
    render(<YourComponent count={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})
```

**Text matcher gotcha:** use exact strings for text that appears in multiple places in the UI. Prefer `getByText("high")` over `getByText(/high/i)` — partial/case-insensitive matchers can match unintended elements (e.g. the GFW info callout contains "high confidence").

**Mocking MapLibre:** if your component renders `Map.tsx` or depends on MapLibre, mock the Map component — it can't render in jsdom:
```typescript
vi.mock('../app/components/Map', () => ({
  Map: () => <div data-testid="map" />,
}))
```

Run to confirm tests fail:
```bash
cd frontend && pnpm test --run
```

## 3. Implement the component

Create `frontend/app/components/YourComponent.tsx`.

Rules:
- TypeScript strict mode — no `any`
- All API response types come from `../client` (generated) — never define them manually
- Tailwind for styling — no inline styles, no CSS modules
- Conditional rendering for loading/error/empty states

For the colour scheme used in existing results UI:
- Confidence: `high → #dc2626`, `nominal → #d97706`, `low → #eab308`, `other → #9ca3af`
- Land cover: `tree_cover → #2d6a4f`, `cropland → #d4a017`, `grassland → #95d5b2`, `wetland → #48cae4`, `urban → #6c757d`, `water → #0077b6`, `bare → #e9c46a`

## 4. Wire into the parent

If this component needs to be mounted in `routes/index.tsx` or another existing component, add it there. Pass all required props down — don't reach back up for state.

If the component introduces new state, add it to `index.tsx` (the state owner), not inside the component.

## 5. Run tests and typecheck

```bash
cd frontend
pnpm test --run
pnpm typecheck
```

All tests must pass and typecheck must be clean before committing.
