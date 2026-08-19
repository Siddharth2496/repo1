(() => {
  'use strict';
  let attempts = 0;
  let loading = false;

  function timerPresent() {
    return !!document.querySelector('.bottom-nav [data-nav="timer"]') && !!document.getElementById('view-timer');
  }

  function premiumAppReady() {
    return !!document.querySelector('.brand-mark') || !!document.getElementById('todayPlanBadge') || document.getElementById('viewTitle')?.textContent === 'Home';
  }

  function ensureTimer() {
    attempts += 1;
    if (timerPresent()) return;
    if (!premiumAppReady() || loading) {
      if (attempts < 30) setTimeout(ensureTimer, 1000);
      return;
    }

    loading = true;
    const script = document.createElement('script');
    script.src = './timer-v1.js?rescue=' + Date.now();
    script.onload = () => {
      loading = false;
      setTimeout(() => {
        if (!timerPresent() && attempts < 30) setTimeout(ensureTimer, 500);
      }, 600);
    };
    script.onerror = () => {
      loading = false;
      if (attempts < 30) setTimeout(ensureTimer, 1200);
    };
    document.body.appendChild(script);
  }

  // The premium v2 shell can replace navigation after the first timer injection.
  // Reconcile after it has settled, and keep watching briefly during startup.
  setTimeout(ensureTimer, 1200);
  setTimeout(ensureTimer, 4000);
  setTimeout(ensureTimer, 8000);
  setTimeout(ensureTimer, 12000);
})();
