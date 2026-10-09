import { useState } from "react";
import "./demo.css";

type View = "buyer" | "owner";
type Stage = "ready" | "quote" | "answer";

const questions = [
  "What information should a freelancer include on an invoice?",
  "Why might a sole trader use a separate business bank account?",
  "What records should a freelancer keep for business expenses?",
];

const examples: Record<string, { answer: string; passage: string }> = {
  [questions[0]]: {
    answer:
      "A freelancer's invoice should identify the seller and client, give a unique invoice number and date, describe the work, and show the amount due, payment terms, and payment details. VAT details apply when the business is VAT registered.",
    passage:
      "A valid invoice should include the seller and customer details, an invoice number, the date, a description of the goods or services, and the amount charged.",
  },
  [questions[1]]: {
    answer:
      "A separate business account can make income and expenses easier to track and reconcile. It can also make bookkeeping and tax preparation clearer, even where a sole trader is not required to use one.",
    passage:
      "Keeping business transactions separate from personal spending can simplify records and help identify deductible business costs.",
  },
  [questions[2]]: {
    answer:
      "Keep invoices, receipts, bank statements, and notes that explain the business purpose of each expense. Organise records by date and category so amounts can be checked later.",
    passage:
      "Expense records should show what was purchased, when, how much was paid, and why the cost related to the business.",
  },
};

export default function DemoPreview() {
  const [view, setView] = useState<View>("buyer");
  const [stage, setStage] = useState<Stage>("ready");
  const [question, setQuestion] = useState(questions[0]);
  const [paused, setPaused] = useState(false);
  const example = examples[question];

  function changeQuestion(value: string) {
    setQuestion(value);
    setStage("ready");
  }

  return (
    <div className="preview-shell">
      <div className="preview-banner" role="status">
        <strong>Local UI preview</strong>
        <span>
          Sample content only. No wallet, payment, model, or Monad transaction
          is connected.
        </span>
        <a href="/">Open app shell</a>
      </div>

      <header className="preview-header">
        <div className="preview-brand">
          <span className="preview-mark">D</span>
          <span>DataVault</span>
        </div>
        <span className="preview-header-note">
          Knowledge access, with terms the owner controls
        </span>
        <span className="preview-network">Monad testnet preview</span>
      </header>

      <main className="preview-main">
        <div className="preview-intro">
          <div>
            <p className="preview-kicker">Paid knowledge access</p>
            <h1>
              Ask the document.
              <br />
              See the source.
            </h1>
            <p>
              Buy one answer from a private collection. Review the price before
              paying and check the cited passage after the answer arrives.
            </p>
          </div>
          <div className="preview-steps" aria-label="How a paid query works">
            <div>
              <b>1</b>
              <span>Review the collection and price</span>
            </div>
            <div>
              <b>2</b>
              <span>Approve payment in your wallet</span>
            </div>
            <div>
              <b>3</b>
              <span>Read an answer with a source receipt</span>
            </div>
          </div>
        </div>

        <nav className="preview-tabs" aria-label="Preview roles">
          <button
            type="button"
            className={view === "buyer" ? "active" : ""}
            onClick={() => setView("buyer")}
          >
            Buyer view
          </button>
          <button
            type="button"
            className={view === "owner" ? "active" : ""}
            onClick={() => setView("owner")}
          >
            Owner view
          </button>
        </nav>

        {view === "buyer" ? (
          <div className="preview-grid">
            <section className="preview-card preview-query">
              <div className="preview-section-head">
                <span>UK Practical Guide</span>
                <span className="preview-pill">Sample collection</span>
              </div>
              <h2>What would you like to know?</h2>
              <p>
                Choose a question or write your own. The sample answer below is
                for layout testing only.
              </p>
              <div
                className="preview-suggestions"
                aria-label="Suggested questions"
              >
                {questions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={question === item ? "selected" : ""}
                    onClick={() => changeQuestion(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label htmlFor="preview-question">Your question</label>
              <textarea
                id="preview-question"
                value={question}
                onChange={(event) => changeQuestion(event.target.value)}
                rows={3}
                maxLength={500}
              />
              {paused && (
                <p className="preview-warning" role="alert">
                  The owner paused this collection. New queries are unavailable.
                </p>
              )}
              {stage === "ready" && (
                <button
                  className="preview-primary"
                  type="button"
                  disabled={!question.trim() || paused}
                  onClick={() => setStage("quote")}
                >
                  Review price
                </button>
              )}
              {stage !== "ready" && (
                <div className="preview-quote">
                  <span>One answer</span>
                  <strong>0.001 MON</strong>
                  <p>
                    In the real app, your wallet opens escrow on Monad. An
                    unanswered query can be refunded after the contract timeout.
                  </p>
                  {stage === "quote" &&
                    (example ? (
                      <button
                        className="preview-primary"
                        type="button"
                        onClick={() => setStage("answer")}
                      >
                        Preview answered state
                      </button>
                    ) : (
                      <p className="preview-fine">
                        Answer preview is available for the suggested questions.
                        The real app accepts custom questions.
                      </p>
                    ))}
                </div>
              )}
            </section>

            <aside className="preview-card preview-result">
              <div className="preview-section-head">
                <span>Answer and receipt</span>
                <span className="preview-pill neutral">
                  {stage === "answer" ? "Sample result" : "Waiting"}
                </span>
              </div>
              {stage === "answer" && example ? (
                <>
                  <h2>A clear answer, tied to a passage.</h2>
                  <p className="preview-answer">{example.answer}</p>
                  <div className="preview-citation">
                    <span>Source passage 1</span>
                    <p>“{example.passage}”</p>
                    <small>Illustrative passage, version 1</small>
                  </div>
                  <div className="preview-receipt">
                    <div>
                      <span>Payment</span>
                      <strong>0.001 MON</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>Sample settled state</strong>
                    </div>
                  </div>
                  <p className="preview-fine">
                    This preview has no transaction hash or verified model
                    output.
                  </p>
                </>
              ) : (
                <div className="preview-empty">
                  <div className="preview-empty-icon">?</div>
                  <h2>Your answer appears here</h2>
                  <p>
                    In the real flow, the app waits for the payment transaction,
                    retrieves matching private passages, and settles only after
                    an answer is ready.
                  </p>
                </div>
              )}
            </aside>
          </div>
        ) : (
          <div className="preview-grid">
            <section className="preview-card preview-query">
              <div className="preview-section-head">
                <span>Collection settings</span>
                <span className="preview-pill">Owner preview</span>
              </div>
              <h2>UK Practical Guide</h2>
              <p>
                Control whether buyers can open new paid queries. Existing
                answers and receipts remain available.
              </p>
              <div className="preview-owner-row">
                <span>Access</span>
                <strong>{paused ? "Paused" : "Active"}</strong>
              </div>
              <div className="preview-owner-row">
                <span>Price per answer</span>
                <strong>0.001 MON</strong>
              </div>
              <div className="preview-owner-row">
                <span>Content version</span>
                <strong>1</strong>
              </div>
              <button
                className="preview-primary"
                type="button"
                onClick={() => {
                  setPaused(!paused);
                  setStage("ready");
                }}
              >
                {paused ? "Preview resume access" : "Preview pause access"}
              </button>
              <p className="preview-fine">
                This switch changes only local preview state. The real owner
                action requires a Monad wallet transaction.
              </p>
            </section>
            <aside className="preview-card preview-result preview-owner-note">
              <div className="preview-section-head">
                <span>How owner control works</span>
              </div>
              <h2>A policy check before every answer.</h2>
              <p>
                The real service checks the current on-chain collection policy
                before retrieving private passages. Pausing blocks new queries
                through DataVault.
              </p>
              <p>
                It cannot retract answers already delivered or establish legal
                ownership of the uploaded content.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
