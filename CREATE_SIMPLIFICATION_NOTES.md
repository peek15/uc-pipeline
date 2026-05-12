# Create Simplification Notes

## Audit
Create had already moved toward a production surface, but the default read still exposed too much internal metadata: archetype, era, raw format, reach score, template fields, and workflow details were visible before the user saw the operational context.

## What Changed
- Left queue rows now foreground:
  - content title
  - programme/campaign context
  - current stage
  - next action
  - readiness count
- Generic default rows no longer foreground emotional archetype, era, or raw internal format metadata.
- The selected item header now foregrounds:
  - title
  - programme/campaign
  - current stage
  - readiness count
  - next action
- Campaign context was neutralized visually so campaign color does not dominate Create.
- Template/workflow metadata moved into a collapsed `Details / metadata` area.

## What Stayed
- Existing production steps and readiness calculations remain unchanged.
- Readiness bars remain only as real production completeness indicators.
- UC-specific data and logic were not deleted; it is simply no longer foregrounded in generic Creative Engine surfaces.

## Remaining Limits
- Create is not Studio V1.
- No publishing automation, frame editing, provider changes, or scoring/ranking changes were introduced.
