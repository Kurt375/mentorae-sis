document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';

    // DOM Elements
    const flashcardTitleEl = document.getElementById('flashcardTitle');
    const backBtn = document.getElementById('backBtn');
    const flashcardEl = document.getElementById('flashcard');
    const flashcardTermEl = document.getElementById('flashcardTerm');
    const flashcardDefinitionEl = document.getElementById('flashcardDefinition');
    const prevCardBtn = document.getElementById('prevCardBtn');
    const flipCardBtn = document.getElementById('flipCardBtn');
    const nextCardBtn = document.getElementById('nextCardBtn');
    const cardCounterEl = document.getElementById('cardCounter');
    const noFlashcardsAlert = document.getElementById('noFlashcardsAlert');
    const flashcardApp = document.getElementById('flashcardApp');

    let currentFlashcards = [];
    let currentCardIndex = 0;
    let subjectName, topicTitle;

    function loadSubjects() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        return storedSubjects ? JSON.parse(storedSubjects) : [];
    }

    function renderCard() {
        if (currentFlashcards.length === 0) {
            flashcardApp.style.display = 'none';
            noFlashcardsAlert.style.display = 'block';
            return;
        }

        flashcardApp.style.display = 'block';
        noFlashcardsAlert.style.display = 'none';

        const card = currentFlashcards[currentCardIndex];
        flashcardTermEl.textContent = card.term;
        flashcardDefinitionEl.textContent = card.definition;
        
        // Reset flip state
        flashcardEl.classList.remove('flipped');

        cardCounterEl.textContent = `Card ${currentCardIndex + 1} of ${currentFlashcards.length}`;

        // Disable/enable navigation buttons
        prevCardBtn.disabled = currentCardIndex === 0;
        nextCardBtn.disabled = currentCardIndex === currentFlashcards.length - 1;
    }

    function flipCard() {
        flashcardEl.classList.toggle('flipped');
    }

    function showNextCard() {
        if (currentCardIndex < currentFlashcards.length - 1) {
            currentCardIndex++;
            renderCard();
        }
    }

    function showPrevCard() {
        if (currentCardIndex > 0) {
            currentCardIndex--;
            renderCard();
        }
    }

    function init() {
        const urlParams = new URLSearchParams(window.location.search);
        subjectName = decodeURIComponent(urlParams.get('subject'));
        topicTitle = decodeURIComponent(urlParams.get('topic'));
        const sectionName = urlParams.get('section'); // Get section for back button

        flashcardTitleEl.textContent = `Flashcards: ${topicTitle}`;
        backBtn.href = `subject_detail_teacher.html?subject=${encodeURIComponent(subjectName)}&section=${encodeURIComponent(sectionName || '')}`;

        const allSubjects = loadSubjects();
        const subject = allSubjects.find(s => s.name === subjectName);
        
        let topic = null;
        if (subject) {
            // Flashcards can be part of a main topic or a recommendation
            const allContent = [...(subject.topics || []), ...(subject.recommendations || [])];
            topic = allContent.find(t => t.title === topicTitle);
        }

        if (topic && topic.flashcards && topic.flashcards.length > 0) {
            currentFlashcards = topic.flashcards;
            renderCard();
        } else {
            flashcardApp.style.display = 'none';
            noFlashcardsAlert.style.display = 'block';
        }

        // Event Listeners
        flipCardBtn.addEventListener('click', flipCard);
        nextCardBtn.addEventListener('click', showNextCard);
        prevCardBtn.addEventListener('click', showPrevCard);
    }

    // Live Date & Time
    function updateDateTime() {
        const liveDateElement = document.getElementById('liveDate');
        const liveTimeElement = document.getElementById('liveTime');
        if (!liveDateElement || !liveTimeElement) return;

        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        liveDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
        const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }

    // Initial calls
    init();
    updateDateTime();
    setInterval(updateDateTime, 1000);
});
