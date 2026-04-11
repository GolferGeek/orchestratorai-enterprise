---
title: Brief Stress Test
video:
---

## Benefits

- **Your brief gets a Red Team before opposing counsel does.** The system spins up a mirror legal team that argues the other side — counter-arguments, distinguishing cases, factual challenges — and a judge scores every exchange. You see every weakness before your opponent does.

- **Every citation the Red Team raises is verified.** Counter-authorities come from your RAG knowledge base, never from model hallucination. If the Red Team tries to cite a case that doesn't exist in your sources, it gets stripped and flagged. No phantom case law.

- **Calibrated severity scoring.** A judge agent scores each attack on a rubric (legal soundness, factual support, citation quality, persuasiveness) and produces an overall severity rating. The debate continues until no high-severity attacks remain — or your round cap is hit.

- **Position-bias mitigation.** The judge receives Blue and Red arguments in randomized order with neutral labels, so scoring isn't influenced by which side argued last.

- **You control the fortification.** Review the ranked attack list, accept or reject each recommendation, then choose to fortify the brief with your accepted changes — or approve the report as-is.

- **Sovereign-ready.** Runs entirely on local Ollama models. Your brief never leaves the machine. Sealed facts and privileged work product stay sealed.

## Features

- 3-agent Blue Team (argument defender, authority defender, facts defender)
- 3-agent Red Team (counter-argument, distinguishing cases, factual challenge)
- Judge agent with 5-dimension rubric and double-blind position randomization
- Convergence detection: severity threshold + hard round cap + diminishing returns
- Ranked stress-test report: attacks, weak citations, factual gaps
- Per-recommendation accept/reject with fortification pass
- Citation grounding via RAG (no hallucinated counter-authority)
- Provider-aware execution (parallel cloud, sequential Ollama)
- SSE streaming for real-time debate progress

## When to use it

- Before filing any motion, brief, or memo — especially on high-stakes matters
- When you want a structured adversarial review but don't have time for a senior associate to steelman the other side
- When working on sovereign/sealed matters where the brief can't leave your machine
- For demo purposes: watching a Red Team shred a brief in real time is compelling

## How it works

1. Click **New** and upload your brief (.txt, .md, .pdf, .docx)
2. Optionally add instructions and adjust debate configuration (max rounds, severity threshold)
3. Watch the adversarial debate unfold: Blue Team defends, Red Team attacks, Judge scores
4. Review the stress-test report: ranked attacks with severity, Red/Blue/Judge assessments
5. Accept or reject each recommendation, then choose Approve & Fortify, Approve Without Changes, or Reject & Re-run
6. Receive your fortified brief (if fortification was chosen) alongside the full report
