import React, { useState, useEffect } from 'react';
import App from './App.jsx';
import LegalPage from './LegalPage.jsx';
import { impressumMd } from './legal/impressum.js';
import { datenschutzMd } from './legal/datenschutz.js';
import { agbMd } from './legal/agb.js';

const ROUTES = {
  '/impressum': impressumMd,
  '/datenschutz': datenschutzMd,
  '/agb': agbMd
};

export default function Root() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    function onPopState() {
      setPath(window.location.pathname);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(to) {
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  }

  const legalMarkdown = ROUTES[path];

  if (legalMarkdown) {
    return <LegalPage markdown={legalMarkdown} onBack={() => navigate('/')} />;
  }

  return <App onNavigate={navigate} />;
}
