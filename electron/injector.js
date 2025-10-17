
// Create a button
const button = document.createElement('button');
button.textContent = 'Capture Adobe Context';

// Style the button
Object.assign(button.style, {
    position: 'fixed',
    bottom: '10px',
    right: '10px',
    zIndex: '9999',
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer'
});

// Add event listener
button.addEventListener('click', () => {
    window.electronBridge.captureContext();
});

// Append to the body
document.body.appendChild(button);
