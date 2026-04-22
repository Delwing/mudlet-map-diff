# 1.0.0
- rewrite project to TypeScript
- introduce new unified diff model with `EntityDiff` and `PropertyDiff`
- add support for area and map-level property diffing
- compare labels using `labelId` within the same area
- include `pixMap` (Buffer) in diffs

# 0.2.1
- remove accidentally left resolve() causing failure

# 0.2.0
- svgs will have their width and height removed so, they will take up 100% of available space

# 0.1.0
- initial release
