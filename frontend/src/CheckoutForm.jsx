import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

export default function CheckoutForm({ onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required'
    });

    if (error) {
      setErrorMessage(error.message || 'Die Zahlung ist fehlgeschlagen.');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess();
    } else {
      // Manche Zahlungsmethoden (z.B. bestimmte Bank-Weiterleitungen) brauchen
      // weitere Schritte; das deckt der Webhook im Backend ohnehin final ab.
      setErrorMessage('Zahlung wird verarbeitet — das kann einen Moment dauern.');
      setIsProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {errorMessage && (
        <p style={{ color: '#F09595', fontSize: '13px', marginTop: '10px' }}>{errorMessage}</p>
      )}
      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #444441', background: 'transparent', color: '#F1EFE8', cursor: 'pointer', fontSize: '13px' }}
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#5DCAA5', color: '#0B2A20', cursor: isProcessing ? 'default' : 'pointer', fontSize: '13px', fontWeight: 600, opacity: isProcessing ? 0.6 : 1 }}
        >
          {isProcessing ? 'Wird verarbeitet…' : '$1,00 bezahlen'}
        </button>
      </div>
    </form>
  );
}
