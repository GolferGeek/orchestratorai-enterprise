# GolferGeek Post — March 25, 2026

I build with Claude Code about ten hours a day. Here's the process I've landed on that keeps making me faster.

I don't code directly with the prompt anymore — at least not to the degree that I can avoid it. Instead, I work through a set of custom commands and agents for everything. `/commit`, `/scan-errors`, `/fix-errors`, `/monitor`, `/test` — each one is a structured skill that knows the codebase and follows specific patterns. 

As a quick aside, `/monitor` is actually pretty cool-- I run it to catch exceptions to all of my stated architecture concerns.  Even with me watching closely, the codebase can get out of whack for the things that really are important to me. By running `/monitor`, I find all those. There's a corresponding `/harden` command that goes through and cleans them all up.

Here's why this is working: at the end of every session with a command, I work with Claude to figure out what was lacking. Where did the command miss? What context was it missing? What did I have to intervene on? We improve it together, and the next time I use that command, it's more likely to give me exactly what I need.

The commands and agents compound. Every improvement sticks.

The other thing I've started doing that might surprise other devs: every few weeks I archive all my Claude Code skills, agents, and commands and start fresh. Claude Code is making significant advances — it's dramatically more capable than it was even two months ago. Carrying forward old patterns that were workarounds for previous limitations actually slows you down. Starting clean with the current capabilities and rebuilding the commands takes a day and produces better results than months of accumulated cruft.

I still review most files before I commit. That hasn't changed. But I'm much more careful and much less vibe-y than I was six months ago. Structured AI-assisted coding with iterating commands beats unstructured vibe coding every time.

The irony is that being more disciplined about how I use AI has made me feel more like a developer, not less. I'm sure you can imagine how strange this is after 25 years of writing my own code.

And just so you know, the process of constantly evaluating and improving your system, is not for the faint of heart. Orchestrator AI is a pretty large mono-repo. Working in large codebases is significantly different than working on a live code app.  The pace of change to maintain professional standards is not what we're used to. Even five years ago, I wouldn't make significant changes to the code structure and the coding process for a year or two. Now I'm doing every couple of weeks.
