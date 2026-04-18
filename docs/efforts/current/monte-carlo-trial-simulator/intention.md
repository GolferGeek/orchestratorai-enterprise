# Intention: Monte Carlo Trial Simulator

## Priority: #9 of 10 Legal Workflows

## What

A litigation team inputs a complete case record: the claims, the evidence, the witness list, the legal theories, the jurisdiction, and the judge (if known). The platform runs **50-100 simulated mini-trials** — each with varied jury compositions, judge temperaments, evidence presentation orders, and opposing strategy variations. Each simulation uses adversarial agents for both sides (plaintiff and defense), a judge agent that rules on motions and objections, and a jury agent that deliberates and reaches a verdict.

The aggregate results produce a **probability distribution of outcomes**: "65% chance of favorable verdict, 25% partial, 10% adverse" — with analysis of which factors swing the outcome most. A sensitivity analysis shows which evidence, witnesses, and arguments have the highest impact on the verdict distribution. The litigation team uses this to make informed decisions about settlement vs. trial, resource allocation, and trial strategy.

This is the most technically ambitious single workflow in the portfolio. It's also the jaw-dropper — the demo that gets us on stage at LegalTech and reframes what legal AI can do.

## Why

### The decision it informs

The most consequential decision in litigation is whether to settle or go to trial. This decision is made based on:
- The lawyer's gut feeling (calibrated by experience, biased by recent outcomes)
- A rough mental estimate of the odds (subjective, not systematic)
- The client's risk tolerance (often poorly calibrated because they don't have data)

No tool exists that systematically simulates trial outcomes with varied parameters and produces a probability distribution. Litigation analytics tools (Lex Machina, Premonition) analyze historical case data — they tell you "judges in this district rule for plaintiffs 58% of the time in patent cases." But they don't simulate *your specific case* with *your specific evidence and arguments*.

### The economic unlock

- A wrong settlement decision costs millions — settling too low leaves money on the table, settling too high (or refusing to settle) risks a catastrophic verdict
- The simulation doesn't replace the lawyer's judgment; it gives them **data** to anchor that judgment
- Even a rough probability distribution is infinitely more useful than the current approach (which is no distribution at all)
- For insurance companies and litigation funders, systematic outcome prediction is transformative — it enables portfolio-level risk management across hundreds of matters

### Why "Monte Carlo"

Monte Carlo simulation is a well-established technique: run many simulations with randomized parameters, aggregate the results to approximate a probability distribution. The legal application:

- Each simulation varies: jury demographics, judge strictness, which evidence gets admitted/excluded, which witnesses are more/less credible, which legal arguments land
- No single simulation is "the answer" — the distribution across many simulations IS the answer
- The more simulations, the more accurate the distribution (convergence follows the law of large numbers)

### The pattern it introduces

**Parameterized parallel execution with aggregation** — running many instances of a workflow with systematically varied inputs and aggregating the results into a statistical summary. This is a new orchestration pattern that doesn't exist in any previous workflow:

- The DD Room (#4) processes many documents through ONE pipeline
- Monte Carlo runs many instances of the SAME pipeline with different parameters
- The aggregation layer (statistical analysis across simulation results) is net-new

This pattern has applications beyond legal: financial modeling, risk assessment, scenario planning. Building it for trial simulation validates it for the platform generally.

## The shape of the thing

### Case record definition

The user provides:

```typescript
interface CaseRecord {
  matterId: string;
  jurisdiction: string;
  courtLevel: 'federal-district' | 'state-trial' | 'appellate';
  judge?: string;                    // Known judge, if assigned
  caseType: string;                  // "patent-infringement", "breach-of-contract", etc.
  
  // Claims and defenses
  claims: {
    claimId: string;
    description: string;
    elements: string[];              // Legal elements that must be proved
    standardOfProof: string;         // "preponderance", "clear-and-convincing", etc.
  }[];
  
  defenses: {
    defenseId: string;
    description: string;
    type: 'affirmative' | 'negating';
  }[];
  
  // Evidence
  evidence: {
    evidenceId: string;
    type: 'document' | 'testimony' | 'expert' | 'physical' | 'demonstrative';
    description: string;
    supportsClaims: string[];        // Which claims this evidence supports
    supportsDefenses: string[];      // Which defenses this evidence supports
    strength: 'strong' | 'moderate' | 'weak';
    admissibilityRisk: 'low' | 'medium' | 'high';
    content?: string;                // Actual evidence text/summary
  }[];
  
  // Witnesses
  witnesses: {
    witnessId: string;
    name: string;
    type: 'fact' | 'expert' | 'party';
    side: 'plaintiff' | 'defense';
    credibilityFactors: string[];    // What helps/hurts credibility
    keyTestimony: string;            // What they'll say
  }[];
  
  // Damages
  damagesModel: {
    type: 'compensatory' | 'punitive' | 'statutory' | 'injunctive';
    rangeMin: number;
    rangeMax: number;
    calculation: string;             // How damages are calculated
  }[];
  
  // Simulation parameters
  simulationCount: number;           // Default 50, max 200
  variationParameters: string[];     // Which parameters to vary across simulations
}
```

### The simulation graph

A new LangGraph workflow — `trial-simulation.graph.ts` — designed to run many times with varied parameters.

**Each individual simulation:**

1. **Parameter generation node** — generates the specific parameters for this simulation run:
   - Jury composition: demographics, education levels, attitudes (drawn from a statistical distribution appropriate to the jurisdiction)
   - Judge characteristics: strictness on evidence, sympathy toward plaintiff/defense, patience with objections (drawn from the known judge's profile or a distribution)
   - Evidence admissibility: for each evidence item with medium/high admissibility risk, a coin flip (weighted by the risk level) determines whether it's admitted
   - Witness credibility: for each witness, a credibility modifier drawn from a distribution (some simulations the witness is strong, some weak)

2. **Opening arguments node** — both sides present their case theory:
   - Plaintiff agent summarizes its theory, key evidence, and damages claim
   - Defense agent summarizes its defense theory and key evidence
   - The judge agent notes initial impressions (this affects ruling tendencies later)

3. **Evidence presentation node** — each side presents its evidence:
   - For each piece of evidence: the presenting side frames it, the opposing side objects or cross-examines
   - The judge agent rules on objections (influenced by the judge characteristics parameter)
   - The jury agent notes the evidence impact (influenced by the jury composition parameter)

4. **Closing arguments node** — both sides summarize:
   - Plaintiff agent frames the evidence for each claim element
   - Defense agent frames the evidence against / for defenses

5. **Jury deliberation node** — the jury agent:
   - Evaluates each claim element against the standard of proof
   - Considers each defense
   - Reaches a verdict (liable/not liable per claim)
   - If liable: determines damages within the range, influenced by the evidence and jury composition

6. **Verdict recording** — the simulation result:
   ```typescript
   interface SimulationResult {
     simulationId: string;
     parameters: SimulationParameters;  // The specific parameter set for this run
     verdict: 'plaintiff' | 'defense' | 'mixed';
     claimResults: { claimId: string; liable: boolean }[];
     damagesAwarded?: number;
     keyFactors: string[];              // What drove this verdict
     pivotalMoments: string[];          // Where the simulation turned
   }
   ```

### The simulation orchestrator

The orchestrator runs N simulations and manages the overall process:

1. **Parameter space generation** — creates N sets of varied parameters, ensuring systematic coverage:
   - Not purely random — uses stratified sampling to cover the parameter space efficiently
   - Each parameter varies independently unless correlated (e.g., jury demographics are correlated with jurisdiction)

2. **Simulation execution** — runs simulations:
   - On cloud providers: parallel execution (10-50 concurrent simulations)
   - On Ollama: sequential execution (one simulation at a time, ~5-10 minutes each, so 50 simulations = 4-8 hours — an overnight job)
   - Each simulation is a sub-graph invocation within the same conversationId

3. **Aggregation node** — after all simulations complete:
   - **Outcome distribution**: plaintiff wins X%, defense wins Y%, mixed Z%
   - **Damages distribution**: histogram of damages awards across plaintiff-wins, with median, mean, and percentiles
   - **Expected value calculation**: P(plaintiff wins) × E(damages | plaintiff wins) = expected value of going to trial
   - **Sensitivity analysis**: which parameters had the highest impact on outcomes:
     - "When Evidence #4 is excluded, plaintiff win rate drops from 65% to 35%"
     - "When Witness #2 is credible, damages increase by 40%"
     - "When the jury skews older, defense win rate increases by 15%"
   - **Strategy recommendations**: based on the sensitivity analysis:
     - "Focus trial prep on ensuring Evidence #4 is admitted — it's the single highest-impact factor"
     - "Settlement range recommendation: $X-$Y based on the 25th-75th percentile of the damages distribution"

### Frontend: Trial Simulator Dashboard

The simulation detail panel has four tabs:

1. **Simulation Progress** — real-time progress bar showing simulations completed, with a running outcome distribution that updates as each simulation finishes. This is the live demo view — watching the distribution converge as simulations accumulate.

2. **Outcome Distribution** — the final probability distribution:
   - Verdict pie chart (plaintiff / defense / mixed)
   - Damages histogram
   - Expected value summary
   - Settlement range recommendation

3. **Sensitivity Analysis** — interactive:
   - A sortable table of factors by impact magnitude
   - Click a factor to see its effect on the outcome distribution (e.g., "show me the distribution with/without Evidence #4")
   - Scenario builder: "what if Evidence #4 is excluded AND Witness #2 is not credible?" — reruns the aggregation with those constraints applied as filters

4. **Simulation Browser** — browse individual simulation transcripts:
   - Sortable by outcome, damages, key factors
   - Click a simulation to read the full trial transcript
   - Useful for the attorney to understand WHY certain simulations went a certain way

### The "experimental" label

This workflow ships with a prominent "Experimental" label in the UI and a disclaimer:

> "Trial simulation is an analytical tool that approximates outcome distributions based on systematic parameter variation. It is not a prediction of trial outcomes. Results should be used to inform strategy decisions, not replace legal judgment. The accuracy of simulations depends heavily on the quality and completeness of the case record provided."

The "experimental" label is removed only after the system has been validated against a meaningful set of historical cases where the actual outcome is known, demonstrating that the simulation distribution would have included the actual outcome within reasonable confidence bounds.

## Constraints

- **No outcome guarantees. Ever.** This is an analytical tool, not an oracle. The disclaimer is mandatory and non-removable.
- **The simulation is only as good as the case record.** Garbage in, garbage out. The UI should strongly encourage complete case records and warn when key fields are missing.
- **No fallbacks on simulation failures.** If a simulation crashes (model error, context overflow), it's excluded from the aggregation with a note. The aggregation reports "48/50 simulations completed" rather than silently proceeding.
- **ExecutionContext is the capsule.** One simulation run (all N simulations) = one job = one conversationId. Individual simulations are sub-graph invocations, not separate jobs.
- **Token cost controls.** 50-100 simulations × 5-10 LLM calls per simulation = 250-1,000 LLM calls per run. On cloud providers, this is expensive ($50-200 per run). The UI must show estimated cost before launch and the user must explicitly approve.
- **Simulation count limits.** Default 50, max 200. Beyond 200, the distribution converges and additional simulations add cost without meaningful statistical improvement.

## Out of scope

- **Appeal simulation.** Simulating appellate outcomes requires a different model (panel of judges, no jury, different standard of review). Future expansion.
- **Class action simulation.** Class actions add certification analysis and aggregate damages modeling. Future specialized variant.
- **Real-time settlement negotiation support.** Using the simulation results during active mediation to update positions in real time. Future integration.
- **Historical validation.** Building the historical case dataset and validation framework. This is a separate research effort.
- **Juror profile database.** Modeling jurisdiction-specific jury demographics and attitudes from empirical data. The initial version uses simplified demographic distributions.

## Dependencies

- Adversarial Brief (#3) — adversarial agent pattern (plaintiff vs. defense agents), judge scoring
- Legal Research (#2) — legal theory grounding for agent arguments
- Deposition Prep (#8) — interactive session pattern (for future interactive trial simulation mode)
- Legal Department async workspace (completed)

## Estimated scope

Large. 4-6 weeks. The simulation graph (6 nodes), the parameter space generator, the aggregation/statistics layer, the sensitivity analysis, and the four-tab dashboard are all net-new. The adversarial agent pattern reuses #3, but the trial-specific prompts (opening/closing arguments, evidence presentation, jury deliberation) require significant prompt engineering and testing.

## Why this goes ninth

- The jaw-dropper — the demo that gets us on stage at LegalTech.
- Most technically ambitious single workflow — parameterized parallel execution is a genuinely new orchestration pattern.
- Builds on the adversarial pattern from #3, the research pattern from #2, and the interactive pattern from #8.
- High value for sophisticated litigation teams and litigation funders — but requires the "experimental" label until validated.
- By this point, every underlying pattern (adversarial, research, batch processing, interactive) has been built and tested, so the risk is in the trial simulation domain modeling, not the platform infrastructure.
