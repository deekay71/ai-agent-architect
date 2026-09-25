# Locked mechanical memory benchmark fixture

`corpus/` is the only ingestion input. `questions.json` contains public requests without expected labels. `oracle/gold.json` is read only by the evaluator after retrieval; no oracle, question file or protocol is ingested into Memory. `protocol.json` predeclares budgets, trial order and thresholds. `campaign-lock.json` hashes all fixture inputs before the first holdout run; changed inputs require a new named campaign, never silently relock this one.

The 30 questions split into 20 dev / 10 holdout with disjoint scenario families. They share a small infrastructure corpus, as a retrieval benchmark must; the holdout questions and labels do not enter retrieval storage. Labels are hand-authored starter fixtures, not independent expert adjudication. The author has seen the holdout; locking prevents subsequent tuning but is not a blinded study.

Facts are structured source content. The exact-match reader consumes them without any expected answer. Graph edges are explicit authored document references; parser-inferred references never become explicit retrieval edges. `lifecycle: active` describes a source wrapper, not an approved Claim. Prior retry revision is superseded by ingesting the current revision under the same source ID; revoked/quarantined states use Memory transitions.

`corpus/code/` is a small C# infrastructure sample project for a bounded syntax spike. It is not gameplay. This environment has no `dotnet`; no C# compile or Android build is claimed. No arbitrary scripts are executed from corpus content.
