document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';

    // DOM Elements
    const flashcard = document.getElementById('flashcard');
    const flashcardTerm = document.getElementById('flashcardTerm');
    const flashcardDefinition = document.getElementById('flashcardDefinition');
    const prevCardBtn = document.getElementById('prevCardBtn');
    const nextCardBtn = document.getElementById('nextCardBtn');
    const flipCardBtn = document.getElementById('flipCardBtn');
    const currentCardIndexDisplay = document.getElementById('currentCardIndex');
    const totalCardsDisplay = document.getElementById('totalCards');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const flashcardProgress = document.getElementById('flashcardProgress');

    // Display Elements
    const subjectNameDisplay = document.getElementById('subjectNameDisplay');
    const topicTitleDisplay = document.getElementById('topicTitleDisplay');
    const topicDescriptionDisplay = document.getElementById('topicDescriptionDisplay');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const flashcardSetTitle = document.getElementById('flashcardSetTitle');

    // State
    let allSubjects = [];
    let currentSubject = null;
    let currentTopic = null;
    let flashcards = [];
    let currentIndex = 0;

    async function loadData() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        allSubjects = storedSubjects ? JSON.parse(storedSubjects) : [];

        const urlParams = new URLSearchParams(window.location.search);
        const subjectName = decodeURIComponent(urlParams.get('subject') || '').trim();
        const topicName = decodeURIComponent(urlParams.get('topic') || '').trim();
        const source = urlParams.get('source');

        currentSubject = allSubjects.find(s => s.name && s.name.trim().toLowerCase() === subjectName.toLowerCase());
        if (currentSubject) {
            const list = source === 'recommendation' ? (currentSubject.recommendations || []) : (currentSubject.topics || []);
            currentTopic = list.find(t => t.title && t.title.trim().toLowerCase() === topicName.toLowerCase());
        }

        // Always attempt live fetch if token is available OR if currentTopic has no cards
        const token = localStorage.getItem('mentorae_token');
        if (token && subjectName) {
            try {
                const data = await authedFetch(`/api/content/topics?subjectName=${encodeURIComponent(subjectName)}`, token);
                if (data && data.success) {
                    const list = source === 'recommendation' ? (data.recommendations || []) : (data.topics || []);
                    const matchedTopic = list.find(t => t.title && t.title.trim().toLowerCase() === topicName.toLowerCase()) ||
                                         (data.topics || []).find(t => t.title && t.title.trim().toLowerCase() === topicName.toLowerCase()) ||
                                         (data.recommendations || []).find(t => t.title && t.title.trim().toLowerCase() === topicName.toLowerCase());
                    if (matchedTopic) {
                        currentTopic = matchedTopic;
                        if (!currentSubject) {
                            currentSubject = { name: subjectName, topics: data.topics || [], recommendations: data.recommendations || [] };
                            allSubjects.push(currentSubject);
                        } else {
                            if (source === 'recommendation') {
                                currentSubject.recommendations = data.recommendations || [];
                            } else {
                                currentSubject.topics = data.topics || [];
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to load flashcards from database:', e);
            }
        }

        if (currentTopic) {
            flashcards = (currentTopic.flashcards || []).map(card => ({
                term: (card.term || card.question || card.front || '').trim(),
                definition: (card.definition || card.answer || card.back || '').trim()
            })).filter(c => c.term !== '' || c.definition !== '');
        } else {
            flashcards = [];
        }

        // Update UI with details
        document.title = `Mentorae - Flashcards: ${currentTopic?.title || topicName || 'Not Found'}`;
        if (pageSubtitle) pageSubtitle.textContent = `Topic: ${currentTopic?.title || topicName || 'N/A'}`;
        if (flashcardSetTitle) flashcardSetTitle.textContent = `Flashcard Set for ${currentTopic?.title || topicName || 'N/A'}`;
        if (subjectNameDisplay) subjectNameDisplay.textContent = currentSubject?.name || subjectName || 'N/A';
        if (topicTitleDisplay) topicTitleDisplay.textContent = currentTopic?.title || topicName || 'N/A';
        if (topicDescriptionDisplay) {
            const desc = (currentTopic?.description || '').trim();
            topicDescriptionDisplay.textContent = desc && desc !== 'N/A' ? desc : 'No description provided for this topic.';
        }

        if (flashcards.length > 0) {
            totalCardsDisplay.textContent = flashcards.length;
            displayCard(currentIndex);
            if (shuffleBtn) shuffleBtn.disabled = false;
        } else {
            if (flashcardTerm) flashcardTerm.textContent = 'No flashcards in this set.';
            if (flashcardDefinition) flashcardDefinition.textContent = 'Please add flashcards to this topic.';
            if (currentCardIndexDisplay) currentCardIndexDisplay.textContent = 0;
            if (totalCardsDisplay) totalCardsDisplay.textContent = 0;
            if (flipCardBtn) flipCardBtn.disabled = true;
            if (prevCardBtn) prevCardBtn.disabled = true;
            if (nextCardBtn) nextCardBtn.disabled = true;
            if (shuffleBtn) shuffleBtn.disabled = true;
            if (flashcardProgress) {
                flashcardProgress.style.width = '0%';
                flashcardProgress.setAttribute('aria-valuenow', 0);
            }
        }
    }

    function displayCard(index) {
        if (flashcards.length === 0) {
            flashcardTerm.textContent = 'No flashcards in this set.';
            flashcardDefinition.textContent = 'Please add flashcards to this topic.';
            return;
        }

        const card = flashcards[index];
        flashcardTerm.textContent = card.term;
        flashcardDefinition.textContent = card.definition;

        // Reset flip state
        flashcard.classList.remove('is-flipped');

        // Update progress bar
        if (flashcardProgress) {
            const progressPercentage = flashcards.length > 0 ? ((index + 1) / flashcards.length) * 100 : 0;
            flashcardProgress.style.width = `${progressPercentage}%`;
            flashcardProgress.setAttribute('aria-valuenow', progressPercentage);
        }

        // Update controls and display
        currentCardIndexDisplay.textContent = index + 1;
        totalCardsDisplay.textContent = flashcards.length;
        prevCardBtn.disabled = index === 0;
        nextCardBtn.disabled = index === flashcards.length - 1;
        flipCardBtn.disabled = false;
    }

    function shuffleFlashcards() {
        for (let i = flashcards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [flashcards[i], flashcards[j]] = [flashcards[j], flashcards[i]];
        }
        currentIndex = 0;
        displayCard(currentIndex);
        flashcard.classList.remove('is-flipped');
        alert('Flashcards have been shuffled!');
    }

    function init() {
        loadData();

        // Allow flipping by clicking the card itself
        flashcard.addEventListener('click', () => {
            flashcard.classList.toggle('is-flipped');
        });

        flipCardBtn.addEventListener('click', () => {
            flashcard.classList.toggle('is-flipped');
        });

        nextCardBtn.addEventListener('click', () => {
            if (currentIndex < flashcards.length - 1) {
                currentIndex++;
                displayCard(currentIndex);
            }
        });

        prevCardBtn.addEventListener('click', () => {
            if (currentIndex > 0) {
                currentIndex--;
                displayCard(currentIndex);
            }
        });

        if (shuffleBtn) {
            shuffleBtn.addEventListener('click', shuffleFlashcards);
        }

        // Live date and time
        function updateDateTime() {
            const liveDateElement = document.getElementById('liveDate');
            const liveTimeElement = document.getElementById('liveTime');
            if (!liveDateElement || !liveTimeElement) return;
            const now = new Date();
            liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        }
        updateDateTime();
        setInterval(updateDateTime, 1000);
    }

    init();
});