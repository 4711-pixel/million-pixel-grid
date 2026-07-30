import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { colors } from './theme.js';

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
      setErrorMessage('Zahlung wird verarbeitet — das kann einen Moment dauern.');
      setIsProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {errorMessage && (
        <p style={{ color: colors.danger, fontSize: '13px', marginTop: '10px' }}>{errorMessage}</p>
      )}
      <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          style={{ padding: '9px 16px', borderRadius: '7px', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.ink, cursor: 'pointer', fontSize: '13px' }}
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: colors.accent, color: colors.accentText, cursor: isProcessing ? 'default' : 'pointer', fontSize: '13px', fontWeight: 500, opacity: isProcessing ? 0.6 : 1 }}
        >
          {isProcessing ? 'Wird verarbeitet…' : '$1,00 bezahlen'}
        </button>
      </div>
    </form>
  );
}
