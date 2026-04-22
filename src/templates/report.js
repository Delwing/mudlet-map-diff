let currentFocusIndex = -1;
const diffItems = [];

window.onload = () => {
    document.querySelectorAll('.diff-item').forEach((item, index) => {
        diffItems.push({
            el: item,
            id: item.querySelector('.diff-details').id.replace('details-', '')
        });
    });
    document.getElementById('total-count').textContent = diffItems.length;
};

function showDetails(id, forceOpen = null) {
    const el = document.getElementById('details-' + id);
    const header = el.previousElementSibling;
    const toggle = header.querySelector('.diff-toggle');
    
    const shouldOpen = forceOpen !== null ? forceOpen : (el.style.display === 'none');
    
    if (shouldOpen) {
        el.style.display = 'block';
        toggle.textContent = '▲';
        header.style.background = 'var(--bg-hover)';
    } else {
        el.style.display = 'none';
        toggle.textContent = '▼';
        header.style.background = '';
    }
}

function expandAll() {
    diffItems.forEach(item => showDetails(item.id, true));
}

function collapseAll() {
    diffItems.forEach(item => showDetails(item.id, false));
}

function updateFocus(newIndex) {
    if (newIndex < 0 || newIndex >= diffItems.length) return;
    
    if (currentFocusIndex !== -1) {
        diffItems[currentFocusIndex].el.classList.remove('focused');
    }
    
    currentFocusIndex = newIndex;
    const item = diffItems[currentFocusIndex];
    item.el.classList.add('focused');
    
    // Open it
    showDetails(item.id, true);
    
    // Scroll into view
    item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Adjust scroll for sticky header if needed
    // Since we use block: 'center', the sticky header usually won't overlap
    // but if the item is very large, it might.
    // A better approach for sticky headers is:
    // const rect = item.el.getBoundingClientRect();
    // const offset = 100; // estimated sticky header height + margin
    // if (rect.top < offset) window.scrollBy(0, rect.top - offset);
    
    // Update info
    document.getElementById('browse-info').style.display = 'flex';
    document.getElementById('current-pos').textContent = currentFocusIndex + 1;
}

function nextChange() {
    updateFocus(Math.min(currentFocusIndex + 1, diffItems.length - 1));
}

function prevChange() {
    updateFocus(Math.max(currentFocusIndex - 1, 0));
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'j' || e.key === 'ArrowDown') {
        nextChange();
        e.preventDefault();
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
        prevChange();
        e.preventDefault();
    } else if (e.key === 'Escape') {
        if (currentFocusIndex !== -1) {
            diffItems[currentFocusIndex].el.classList.remove('focused');
            currentFocusIndex = -1;
            document.getElementById('browse-info').style.display = 'none';
        }
    }
});
