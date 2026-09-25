export const student = {
  id: 1,
  name: "Kirubel",
  email: "kirubel@example.com",
  role: "student",
  xp: 920,
  streak: 7,
  ranking: 4,
  weeklyXp: 340,
  monthlyXp: 820,
};

export const courses = [
  {
    id: 1,
    title: "English A1",
    description: "Build your English foundations with everyday conversations.",
    progress: 66,
    totalLessons: 6,
    completedLessons: 4,

    modules: [
      {
        id: 1,
        title: "Module 1: Getting Started",
        lessons: [
          {
            id: 1,
            title: "Introducing Yourself",
            duration: "4 min",
            completed: true,
            videoUrl: "https://www.youtube.com/watch?v=hCon8Uq_Bas",
          },
          {
            id: 2,
            title: "Talking About Your Family",
            duration: "3 min",
            completed: true,
            videoUrl: "https://www.youtube.com/watch?v=IhWE4pcqN4I",
          },
          {
            id: 3,
            title: "Talking About Your Job",
            duration: "5 min",
            completed: false,
            videoUrl: "https://www.youtube.com/watch?v=-TaV9p53vww",
          },
        ],
      },
      {
        id: 2,
        title: "Module 2: Everyday English",
        lessons: [
          {
            id: 4,
            title: "Daily Routines",
            duration: "4 min",
            completed: true,
            videoUrl: "https://www.youtube.com/watch?v=5jr_NcXaKbc",
          },
          {
            id: 5,
            title: "Talking About Time",
            duration: "3 min",
            completed: true,
            videoUrl: "https://www.youtube.com/watch?v=kZx0sm1ak-o",
          },
          {
            id: 6,
            title: "Making Plans",
            duration: "5 min",
            completed: false,
            videoUrl: "https://www.youtube.com/watch?v=x1EUisTJUvQ",
          },
        ],
      },
    ],
  },

  {
    id: 2,
    title: "Python Beginner",
    description: "Learn fundamental programming concepts using Python 3.",
    progress: 50,
    totalLessons: 4,
    completedLessons: 2,

    modules: [
      {
        id: 1,
        title: "Module 1: Python Basics",
        lessons: [
          {
            id: 1,
            title: "What is Python?",
            duration: "4 min",
            completed: true,
            videoUrl: "https://www.youtube.com/watch?v=kqtD5dpn9C8",
          },
          {
            id: 2,
            title: "Variables",
            duration: "5 min",
            completed: true,
            videoUrl: "https://www.youtube.com/watch?v=cQT2N-A0M0A",
          },
          {
            id: 3,
            title: "Data Types",
            duration: "4 min",
            completed: false,
            videoUrl: "https://www.youtube.com/watch?v=gCCVsvgR2KU",
          },
          {
            id: 4,
            title: "Conditions",
            duration: "5 min",
            completed: false,
            videoUrl: "https://www.youtube.com/watch?v=PqFKRqpHrjw",
          },
        ],
      },
    ],
  },
];

export const ranking = [
  {
    id: 1,
    name: "Hana",
    xp: 1240,
    weeklyXp: 450,
    monthlyXp: 1100,
  },
  {
    id: 2,
    name: "Dawit",
    xp: 1180,
    weeklyXp: 390,
    monthlyXp: 980,
  },
  {
    id: 3,
    name: "Sara",
    xp: 1050,
    weeklyXp: 360,
    monthlyXp: 910,
  },
  {
    id: 5,
    name: "Abel",
    xp: 890,
    weeklyXp: 280,
    monthlyXp: 790,
  },
];

export const quizzes = [
  // --- English A1 Quizzes ---
  {
    id: 1,
    lessonId: 1,
    questions: [
      {
        id: 1,
        question: "What do you say when you meet someone for the first time?",
        options: ["Nice to meet you.", "Good night.", "See you yesterday."],
        correctAnswer: 0,
      },
      {
        id: 2,
        question: "Which sentence is grammatically correct?",
        options: ["My name Kirubel.", "My name is Kirubel.", "My name are Kirubel."],
        correctAnswer: 1,
      },
      {
        id: 3,
        question: "How do you respond when someone asks, 'How are you?'",
        options: ["I'm fine, thank you.", "I'm name Kirubel.", "I am live in Addis."],
        correctAnswer: 0,
      },
    ],
  },
  {
    id: 2,
    lessonId: 2,
    questions: [
      {
        id: 1,
        question: "How do you introduce your brother to a colleague?",
        options: ["This is my brother.", "This am my brother.", "This are my brother."],
        correctAnswer: 0,
      },
      {
        id: 2,
        question: "Which possessive adjective completes: 'This is my mother. ___ name is Sara.'?",
        options: ["Her", "His", "She"],
        correctAnswer: 0,
      },
      {
        id: 3,
        question: "Which sentence correctly describes family size?",
        options: ["I have two sisters.", "I have two sister.", "I has two sisters."],
        correctAnswer: 0,
      },
    ],
  },
  {
    id: 3,
    lessonId: 3,
    questions: [
      {
        id: 1,
        question: "Which article is used before the noun 'engineer'?",
        options: ["a", "an", "the"],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "How do you ask someone about their profession?",
        options: ["What do you do?", "Where do you do?", "Who do you work?"],
        correctAnswer: 0,
      },
      {
        id: 3,
        question: "Select the correct workplace statement:",
        options: ["I work in a hospital.", "I work at hospital.", "I working hospital."],
        correctAnswer: 0,
      },
    ],
  },
  {
    id: 4,
    lessonId: 4,
    questions: [
      {
        id: 1,
        question: "Which action typically happens first in the morning?",
        options: ["Go to bed", "Get out of bed", "Finish work"],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "Which sentence uses the present simple third-person correctly?",
        options: ["He brush his teeth.", "He brushes his teeth.", "He brushing his teeth."],
        correctAnswer: 1,
      },
      {
        id: 3,
        question: "When do people traditionally eat dinner?",
        options: ["In the morning", "In the afternoon", "In the evening"],
        correctAnswer: 2,
      },
    ],
  },
  {
    id: 5,
    lessonId: 5,
    questions: [
      {
        id: 1,
        question: "How do you ask for the current time?",
        options: ["What time is it?", "What clock is it?", "How much time it is?"],
        correctAnswer: 0,
      },
      {
        id: 2,
        question: "Which preposition is required for specific clock times?",
        options: ["in", "on", "at"],
        correctAnswer: 2,
      },
      {
        id: 3,
        question: "What time is represented by 'half past seven'?",
        options: ["7:30", "7:15", "6:30"],
        correctAnswer: 0,
      },
    ],
  },
  {
    id: 6,
    lessonId: 6,
    questions: [
      {
        id: 1,
        question: "Which phrase is standard for extending a casual invitation?",
        options: ["Would you like to get coffee?", "I am drinking coffee.", "Coffee is good."],
        correctAnswer: 0,
      },
      {
        id: 2,
        question: "Complete the invitation: 'Would you like ___ lunch with me?'",
        options: ["to have", "having", "have"],
        correctAnswer: 0,
      },
      {
        id: 3,
        question: "Which day immediately follows Friday?",
        options: ["Thursday", "Saturday", "Sunday"],
        correctAnswer: 1,
      },
    ],
  },

  // --- Python Beginner Quizzes ---
  {
    id: 7,
    lessonId: 1,
    questions: [
      {
        id: 1,
        question: "What type of language execution model does Python follow?",
        options: ["Compiled", "Interpreted", "Assembly"],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "Which character starts a single-line comment in Python?",
        options: ["//", "/*", "#"],
        correctAnswer: 2,
      },
      {
        id: 3,
        question: "Which function outputs text to the standard console?",
        options: ["console.log()", "print()", "System.out.println()"],
        correctAnswer: 1,
      },
    ],
  },
  {
    id: 8,
    lessonId: 2,
    questions: [
      {
        id: 1,
        question: "How do you assign the integer value 5 to variable 'x' in Python?",
        options: ["x := 5", "x = 5", "int x = 5"],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "Which variable name is invalid according to Python identifier rules?",
        options: ["my_var", "2nd_var", "myVar"],
        correctAnswer: 1,
      },
      {
        id: 3,
        question: "What happens when you reassign an existing variable in Python?",
        options: ["The variable value updates.", "A syntax error occurs.", "An array is created."],
        correctAnswer: 0,
      },
    ],
  },
  {
    id: 9,
    lessonId: 3,
    questions: [
      {
        id: 1,
        question: "What is the data type of the literal value 3.14?",
        options: ["int", "float", "str"],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "Which primitive data type handles True or False states?",
        options: ["bool", "str", "float"],
        correctAnswer: 0,
      },
      {
        id: 3,
        question: "How do you convert the string '10' into a numeric integer?",
        options: ["str(10)", "int('10')", "float('10')"],
        correctAnswer: 1,
      },
    ],
  },
  {
    id: 10,
    lessonId: 4,
    questions: [
      {
        id: 1,
        question: "Which operator checks for value equality in conditional checks?",
        options: ["=", "==", "==="],
        correctAnswer: 1,
      },
      {
        id: 2,
        question: "Which keyword evaluates secondary conditions if the initial 'if' fails?",
        options: ["else if", "elif", "otherwise"],
        correctAnswer: 1,
      },
      {
        id: 3,
        question: "How are code blocks defined within conditional statements in Python?",
        options: ["Curly braces {}", "Indentation", "Parentheses ()"],
        correctAnswer: 1,
      },
    ],
  },
];

export const practices = [
  // --- English A1 Practices ---
  {
    id: 1,
    lessonId: 1,
    title: "Introducing Yourself Practice",
    activities: [
      {
        id: 1,
        question: "Fill in the missing verb:",
        sentence: "My name ___ Kirubel.",
        answer: "is",
      },
      {
        id: 2,
        question: "Fill in the missing pronoun form:",
        sentence: "I ___ from Ethiopia.",
        answer: "am",
      },
      {
        id: 3,
        question: "Fill in the missing greeting word:",
        sentence: "Nice to ___ you.",
        answer: "meet",
      },
    ],
  },
  {
    id: 2,
    lessonId: 2,
    title: "Talking About Your Family Practice",
    activities: [
      {
        id: 1,
        question: "Fill in the missing possessive pronoun:",
        sentence: "This is my mother. ___ name is Sara.",
        answer: "Her",
      },
      {
        id: 2,
        question: "Fill in the plural noun:",
        sentence: "I have one brother and two ___.",
        answer: "sisters",
      },
      {
        id: 3,
        question: "Fill in the verb to describe age:",
        sentence: "My father ___ 45 years old.",
        answer: "is",
      },
    ],
  },
  {
    id: 3,
    lessonId: 3,
    title: "Talking About Your Job Practice",
    activities: [
      {
        id: 1,
        question: "Fill in the missing article:",
        sentence: "He is ___ doctor.",
        answer: "a",
      },
      {
        id: 2,
        question: "Fill in the auxiliary verb:",
        sentence: "What ___ your job?",
        answer: "is",
      },
      {
        id: 3,
        question: "Fill in the workplace action verb:",
        sentence: "I ___ at a tech firm.",
        answer: "work",
      },
    ],
  },
  {
    id: 4,
    lessonId: 4,
    title: "Daily Routines Practice",
    activities: [
      {
        id: 1,
        question: "Fill in the phrasal verb preposition:",
        sentence: "I wake ___ at 7:00 AM.",
        answer: "up",
      },
      {
        id: 2,
        question: "Fill in the present simple verb:",
        sentence: "She ___ her hair every morning.",
        answer: "washes",
      },
      {
        id: 3,
        question: "Fill in the morning meal noun:",
        sentence: "We eat ___ in the morning.",
        answer: "breakfast",
      },
    ],
  },
  {
    id: 5,
    lessonId: 5,
    title: "Talking About Time Practice",
    activities: [
      {
        id: 1,
        question: "Fill in the time preposition:",
        sentence: "The lesson starts ___ 8:00 AM.",
        answer: "at",
      },
      {
        id: 2,
        question: "Fill in the clock phrase modifier:",
        sentence: "It is quarter ___ five.",
        answer: "past",
      },
      {
        id: 3,
        question: "Fill in the time-of-day preposition:",
        sentence: "I study English ___ the evening.",
        answer: "in",
      },
    ],
  },
  {
    id: 6,
    lessonId: 6,
    title: "Making Plans Practice",
    activities: [
      {
        id: 1,
        question: "Fill in the infinitive marker:",
        sentence: "Would you like ___ watch a movie?",
        answer: "to",
      },
      {
        id: 2,
        question: "Fill in the day of the week:",
        sentence: "Let's meet on ___ night.",
        answer: "Friday",
      },
      {
        id: 3,
        question: "Fill in the scheduling preposition:",
        sentence: "I am free ___ Saturday.",
        answer: "on",
      },
    ],
  },

  // --- Python Beginner Practices ---
  {
    id: 7,
    lessonId: 1,
    title: "What is Python Practice",
    activities: [
      {
        id: 1,
        question: "Complete the output statement:",
        sentence: "___('Hello World')",
        answer: "print",
      },
      {
        id: 2,
        question: "Complete the single-line comment symbol:",
        sentence: "___ This is a Python comment",
        answer: "#",
      },
      {
        id: 3,
        question: "Complete the standard Python source file extension:",
        sentence: "script.___ ",
        answer: "py",
      },
    ],
  },
  {
    id: 8,
    lessonId: 2,
    title: "Variables Practice",
    activities: [
      {
        id: 1,
        question: "Complete the assignment operator:",
        sentence: "user_score ___ 100",
        answer: "=",
      },
      {
        id: 2,
        question: "Complete the increment expression:",
        sentence: "score = score ___ 10",
        answer: "+",
      },
      {
        id: 3,
        question: "Assign a boolean truth value:",
        sentence: "is_active = ___",
        answer: "True",
      },
    ],
  },
  {
    id: 9,
    lessonId: 3,
    title: "Data Types Practice",
    activities: [
      {
        id: 1,
        question: "Specify the type name for integer numbers:",
        sentence: "type(10) is ___",
        answer: "int",
      },
      {
        id: 2,
        question: "Complete the string conversion function call:",
        sentence: "val = ___(50)",
        answer: "str",
      },
      {
        id: 3,
        question: "Complete the floating point value:",
        sentence: "price = 19.___ ",
        answer: "99",
      },
    ],
  },
  {
    id: 10,
    lessonId: 4,
    title: "Conditions Practice",
    activities: [
      {
        id: 1,
        question: "Complete the comparison operator (greater than or equal to):",
        sentence: "if score ___ 50:",
        answer: ">=",
      },
      {
        id: 2,
        question: "Complete the secondary condition header:",
        sentence: "___ score >= 30:",
        answer: "elif",
      },
      {
        id: 3,
        question: "Complete the catch-all conditional branch:",
        sentence: "___:",
        answer: "else",
      },
    ],
  },
];