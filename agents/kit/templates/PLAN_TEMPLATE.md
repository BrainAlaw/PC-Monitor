# Mission plan

Record the accepted user outcome, required packages, reserve packages, ownership lanes, preferred tools, dependency graph, integration order and real-machine checks.

Use `MISSION.example.json` for the executable contract. Replace its example goal and checks with project-specific requirements before user acceptance. Estimate useful work, not changed lines. Codex receives substantial work from the start; smaller tools can receive a sequence of bounded packages.

Every package must state its public interfaces, behavior, acceptance evidence, TDD cases and check commands. Cross-lane dependencies wait for user-approved integration. No worker merges or pushes.
