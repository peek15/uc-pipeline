# App Shell Navigation Plan

## Current Navigation After Sprint 9B
Visible primary nav:
- Home (`home`)
- Strategy (`strategy`)
- Ideas (`research`)
- Pipeline (`pipeline`)
- Create (`create`)
- Calendar (`calendar`)
- Analyze (`analyze`)

Secondary planning nav:
- Campaigns (`campaigns`)

Settings remains separate in the lower sidebar/user menu.

## Route Key Notes
- `research` remains the internal key for Ideas. Do not rename it until localStorage, shortcuts, assistant navigation, and saved URL params are migrated.
- `create` remains the internal key for the current Script/Create/Production surface.
- `campaigns` remains because the component and persistence already exist.
- `home` and `strategy` are new tab keys and do not replace existing data routes.

## Safe Relabels Completed
- Research -> Ideas.
- Content -> Pipeline.
- Schedule -> Calendar.
- Insights -> Analyze.
- Campaigns moved to a secondary Planning section.

## Campaigns Recommendation
Campaigns currently groups deliverables, timelines, and linked content. It overlaps with Programmes, Calendar, and Pipeline, but is not mature enough to be a main product promise.

Recommended future decision:
- move Campaigns under Strategy/Planning once Strategy matures, or
- develop it as a real campaign feature after Programmes, Calendar, and Reporting are mature.

Do not expand Campaigns in UI polish sprints unless the product decision is made.

