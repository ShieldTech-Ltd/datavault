import { CheckCircle, SpinnerGap } from './icons';

export default function PaymentProgress({ step, opened }: { step: string; opened: boolean }) {
  const stages = ['Initiate payment', 'Open escrow', 'Process query', 'Generate answer'];
  const stage = step === 'done' || step === 'settlement_pending' ? 3 : step === 'answering' ? 2 : step === 'confirming_open' ? 1 : step === 'failed' && opened ? 2 : 0;
  const complete = step === 'done';
  const pending = ['awaiting_wallet', 'confirming_open', 'answering'].includes(step);
  const label = complete ? 'Answer settled and receipt available' : step === 'quoted' ? 'Price reviewed, ready for your wallet' : step === 'awaiting_wallet' ? 'Confirm the opening transaction in your wallet' : step === 'confirming_open' ? 'Opening escrow on chain...' : step === 'answering' ? 'Generating and settling your cited answer...' : step === 'settlement_pending' ? 'Check settlement before retrying payment' : 'Request needs attention';
  return <div className="dv-payment-progress" role="status"><div>{complete ? <CheckCircle size={30} weight="duotone"/> : <SpinnerGap size={30} className={pending ? 'dv-progress-spinning' : ''}/>}<p><strong>{label}</strong><small>{complete ? 'The owner has received the confirmed query payment.' : 'Payment status comes from your wallet and the service.'}</small></p></div><ol>{stages.map((name,index) => <li key={name} className={complete || index <= stage ? 'reached' : ''}><span>{index + 1}</span>{name}</li>)}</ol></div>;
}
