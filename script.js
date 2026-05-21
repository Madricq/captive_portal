document.addEventListener('DOMContentLoaded', () => {
  let selectedPackage = null;
  let selectedAmount = 0;

  window.showModal = function(name, amount) {
    selectedPackage = name;
    selectedAmount = amount;
    const modal = document.getElementById('paymentModal');
    const modalPackage = document.getElementById('modalPackage');
    const modalMessage = document.getElementById('modalMessage');
    const phoneInput = document.getElementById('phoneInput');

    modalPackage.textContent = `Selected Package: ${name}`;
    phoneInput.value = '';
    modalMessage.textContent = '';
    modal.classList.remove('hidden');
  };

  window.closeModal = function() {
    const modal = document.getElementById('paymentModal');
    modal.classList.add('hidden');
  };

  window.pay = async function() {
    const phoneInput = document.getElementById('phoneInput');
    const modalMessage = document.getElementById('modalMessage');
    const payBtn = document.getElementById('payBtn');
    const phone = phoneInput.value.trim();

    if (!selectedPackage) {
      alert("Select a package first");
      return;
    }

    if (!phone || !/^0\d{9}$/.test(phone)) {
      alert("Enter a valid phone number starting with 0 and 10 digits");
      return;
    }

    payBtn.disabled = true;
    modalMessage.style.color = "black";
    modalMessage.textContent = "⏳ Sending payment request... Please check your phone.";

    let externalId = null;
    let pollInterval = null;
    let timeoutHandle = null;

    try {
      const res = await fetch('https://payment-engine-logic.onrender.com/collect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          phoneNumber: phone,
          packageName: selectedPackage,
          amount: selectedAmount
        })
      });

      const data = await res.json();

      if (data.voucher) {
        // Voucher was created immediately
        modalMessage.style.color = "green";
        modalMessage.textContent = `✅ Payment success! Voucher: ${data.voucher.code}. Connecting...`;
        if (document.sendin) {
          document.sendin.username.value = data.voucher.code;
          document.sendin.password.value = data.voucher.code;
          document.sendin.submit();
        }
        return;
      }

      if (data.result && data.result.externalId) {
        externalId = data.result.externalId;
      } else {
        modalMessage.style.color = "red";
        modalMessage.textContent = "❌ Failed to initiate payment. Try again.";
        payBtn.disabled = false;
        return;
      }

      // Show waiting message and start polling
      modalMessage.style.color = "orange";
      modalMessage.textContent = "📲 Waiting for payment approval. Don't close this page.";

      pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/payment-status/${externalId}`);
          const pollData = await pollRes.json();

          if (pollData.status === 'Success' && pollData.voucher) {
            clearInterval(pollInterval);
            clearTimeout(timeoutHandle);
            modalMessage.style.color = "green";
            modalMessage.innerHTML = `
              ✅ Payment success!<br>
              🎟️ Voucher: <b>${pollData.voucher.code}</b><br>
              Connecting...`;

            if (document.sendin) {
              document.sendin.username.value = pollData.voucher.code;
              document.sendin.password.value = pollData.voucher.code;
              document.sendin.submit();
            }
          } else if (pollData.status === 'Failed') {
            clearInterval(pollInterval);
            clearTimeout(timeoutHandle);
            modalMessage.style.color = "red";
            modalMessage.textContent = "❌ Payment failed. Please try again.";
            payBtn.disabled = false;
          }
          // else keep polling if status is still Pending
        } catch (pollErr) {
          console.error('Polling error:', pollErr);
        }
      }, 5000); // check every 5 seconds

      // ⏳ Set timeout to auto-cancel after 3 minutes
      timeoutHandle = setTimeout(async () => {
        clearInterval(pollInterval);
        try {
          await fetch(`/api/cancel-payment/${externalId}`, {
            method: 'POST'
          });
          modalMessage.style.color = "red";
          modalMessage.textContent = "❌ Payment timed out and was cancelled. Please try again.";
          payBtn.disabled = false;
        } catch (cancelErr) {
          console.error('Cancel error:', cancelErr);
          modalMessage.style.color = "red";
          modalMessage.textContent = "⚠️ Payment timed out. Please try again.";
          payBtn.disabled = false;
        }
      }, 300); // 300 seconds = 5 minutes

    } catch (err) {
      console.error('Initial payment error:', err);
      modalMessage.style.color = "red";
      modalMessage.textContent = "❌ Network error. Please try again.";
      payBtn.disabled = false;
    }
  };
});
