// ============================================================
// Google Drive Expense Tracker
// Plain HTML + JavaScript
// ============================================================

// ------------------------------------------------------------
// 1. CONFIGURATION
// ------------------------------------------------------------

const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

const DRIVE_SCOPE =
    "https://www.googleapis.com/auth/drive.appdata";

const EXPENSE_FILE_NAME = "expenses.json";


// ------------------------------------------------------------
// 2. GLOBAL STATE
// ------------------------------------------------------------

let accessToken = null;
let tokenClient = null;
let driveFileId = null;

let expenses = [];


// ------------------------------------------------------------
// 3. INITIALIZE GOOGLE
// ------------------------------------------------------------

function initializeGoogleDrive() {

    if (!window.google || !google.accounts) {
        console.error("Google Identity Services has not loaded.");
        return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,

        callback: async (tokenResponse) => {

            if (tokenResponse.error) {
                console.error(
                    "Google authentication failed:",
                    tokenResponse
                );

                showStatus("Google connection failed.");
                return;
            }

            accessToken = tokenResponse.access_token;

            console.log("Google Drive connected.");

            showStatus("Connected to Google Drive.");

            await initializeExpenseFile();
        }
    });
}


// ------------------------------------------------------------
// 4. CONNECT GOOGLE DRIVE
// ------------------------------------------------------------

function connectGoogleDrive() {

    if (!tokenClient) {
        initializeGoogleDrive();
    }

    if (!tokenClient) {
        alert(
            "Google services are not ready yet. " +
            "Please refresh the page and try again."
        );

        return;
    }

    tokenClient.requestAccessToken({
        prompt: ""
    });
}


// ------------------------------------------------------------
// 5. INITIALIZE EXPENSE FILE
// ------------------------------------------------------------

async function initializeExpenseFile() {

    try {

        showStatus("Checking Google Drive...");

        // Look for existing file
        const existingFile = await findExpenseFile();

        if (existingFile) {

            driveFileId = existingFile.id;

            console.log(
                "Existing expense file found:",
                driveFileId
            );

            await loadExpensesFromDrive();

        } else {

            console.log(
                "No expense file found. Creating one..."
            );

            await createExpenseFile();

            expenses = [];

            saveToLocalStorage();

        }

        showStatus("Google Drive is ready.");

    } catch (error) {

        console.error(
            "Failed to initialize Google Drive:",
            error
        );

        showStatus("Unable to load Google Drive data.");
    }
}


// ------------------------------------------------------------
// 6. FIND expenses.json
// ------------------------------------------------------------

async function findExpenseFile() {

    const url =
        "https://www.googleapis.com/drive/v3/files" +
        "?spaces=appDataFolder" +
        "&q=" +
        encodeURIComponent(
            `name='${EXPENSE_FILE_NAME}' and trashed=false`
        ) +
        "&fields=files(id,name,modifiedTime)";

    const response = await fetch(url, {

        method: "GET",

        headers: {
            Authorization: `Bearer ${accessToken}`
        }

    });

    if (!response.ok) {

        const errorText = await response.text();

        throw new Error(
            `Failed to search Drive: ${errorText}`
        );
    }

    const data = await response.json();

    if (!data.files || data.files.length === 0) {
        return null;
    }

    return data.files[0];
}


// ------------------------------------------------------------
// 7. CREATE expenses.json
// ------------------------------------------------------------

async function createExpenseFile() {

    const metadata = {
        name: EXPENSE_FILE_NAME,
        parents: ["appDataFolder"],
        mimeType: "application/json"
    };

    const initialData = {
        expenses: []
    };

    const boundary = "-------314159265358979323846";

    const delimiter = `\r\n--${boundary}\r\n`;

    const closeDelimiter =
        `\r\n--${boundary}--`;

    const body =
        delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +

        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        JSON.stringify(initialData) +

        closeDelimiter;


    const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {

            method: "POST",

            headers: {

                Authorization:
                    `Bearer ${accessToken}`,

                "Content-Type":
                    `multipart/related; boundary="${boundary}"`

            },

            body: body

        }
    );


    if (!response.ok) {

        const errorText = await response.text();

        throw new Error(
            `Failed to create expense file: ${errorText}`
        );
    }


    const file = await response.json();

    driveFileId = file.id;

    console.log(
        "Created expense file:",
        driveFileId
    );

    return file;
}


// ------------------------------------------------------------
// 8. LOAD EXPENSES FROM DRIVE
// ------------------------------------------------------------

async function loadExpensesFromDrive() {

    if (!driveFileId) {

        console.error(
            "No Drive file ID available."
        );

        return;
    }


    showStatus(
        "Loading expenses from Google Drive..."
    );


    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
        {

            method: "GET",

            headers: {

                Authorization:
                    `Bearer ${accessToken}`

            }

        }
    );


    if (!response.ok) {

        const errorText = await response.text();

        throw new Error(
            `Failed to load expenses: ${errorText}`
        );
    }


    const data = await response.json();


    if (Array.isArray(data)) {

        // Supports simple array format
        expenses = data;

    } else if (Array.isArray(data.expenses)) {

        expenses = data.expenses;

    } else {

        expenses = [];
    }


    // Update local cache
    saveToLocalStorage();


    console.log(
        "Expenses loaded:",
        expenses
    );


    // Update your UI
    refreshExpenseUI();
}


// ------------------------------------------------------------
// 9. SAVE EXPENSES TO DRIVE
// ------------------------------------------------------------

async function saveExpensesToDrive() {

    if (!accessToken) {

        console.warn(
            "Google Drive is not connected."
        );

        return;
    }


    if (!driveFileId) {

        console.warn(
            "Drive file does not exist. Creating it..."
        );

        await createExpenseFile();
    }


    const data = {
        expenses: expenses
    };


    const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=media`,
        {

            method: "PATCH",

            headers: {

                Authorization:
                    `Bearer ${accessToken}`,

                "Content-Type":
                    "application/json"

            },

            body: JSON.stringify(data)

        }
    );


    if (!response.ok) {

        const errorText = await response.text();

        console.error(
            "Failed to save to Google Drive:",
            errorText
        );

        showStatus(
            "Failed to sync with Google Drive."
        );

        return false;
    }


    console.log(
        "Expenses successfully saved to Google Drive."
    );


    showStatus(
        "Synced with Google Drive ✓"
    );


    return true;
}


// ------------------------------------------------------------
// 10. LOCAL STORAGE
// ------------------------------------------------------------

function loadFromLocalStorage() {

    try {

        const saved =
            localStorage.getItem("expenses");


        if (!saved) {

            expenses = [];

            return;
        }


        expenses = JSON.parse(saved);


        if (!Array.isArray(expenses)) {

            expenses = [];
        }

    } catch (error) {

        console.error(
            "Failed to load local expenses:",
            error
        );

        expenses = [];
    }
}


function saveToLocalStorage() {

    try {

        localStorage.setItem(
            "expenses",
            JSON.stringify(expenses)
        );

    } catch (error) {

        console.error(
            "Failed to save local expenses:",
            error
        );
    }
}


// ------------------------------------------------------------
// 11. ADD EXPENSE
// ------------------------------------------------------------

async function addExpense(expense) {

    const newExpense = {

        id:
            Date.now().toString(),

        ...expense,

        createdAt:
            new Date().toISOString()

    };


    expenses.push(newExpense);


    // Immediately save locally
    saveToLocalStorage();


    // Immediately update UI
    refreshExpenseUI();


    // Sync with Google Drive
    if (accessToken) {

        await saveExpensesToDrive();

    }
}


// ------------------------------------------------------------
// 12. DELETE EXPENSE
// ------------------------------------------------------------

async function deleteExpense(expenseId) {

    expenses = expenses.filter(
        expense =>
            expense.id !== expenseId
    );


    saveToLocalStorage();

    refreshExpenseUI();


    if (accessToken) {

        await saveExpensesToDrive();

    }
}


// ------------------------------------------------------------
// 13. UPDATE EXPENSE
// ------------------------------------------------------------

async function updateExpense(
    expenseId,
    updatedData
) {

    const index =
        expenses.findIndex(
            expense =>
                expense.id === expenseId
        );


    if (index === -1) {

        console.warn(
            "Expense not found:",
            expenseId
        );

        return;
    }


    expenses[index] = {

        ...expenses[index],

        ...updatedData,

        updatedAt:
            new Date().toISOString()

    };


    saveToLocalStorage();

    refreshExpenseUI();


    if (accessToken) {

        await saveExpensesToDrive();

    }
}


// ------------------------------------------------------------
// 14. LOGOUT / DISCONNECT
// ------------------------------------------------------------

function disconnectGoogleDrive() {

    if (!accessToken) {
        return;
    }


    google.accounts.oauth2.revoke(
        accessToken,
        () => {

            console.log(
                "Google Drive access revoked."
            );

            accessToken = null;
            driveFileId = null;

            showStatus(
                "Disconnected from Google Drive."
            );
        }
    );
}


// ------------------------------------------------------------
// 15. STATUS MESSAGE
// ------------------------------------------------------------

function showStatus(message) {

    console.log(message);


    const statusElement =
        document.getElementById("sync-status");


    if (statusElement) {

        statusElement.textContent =
            message;
    }
}


// ------------------------------------------------------------
// 16. UI REFRESH
// ------------------------------------------------------------

function refreshExpenseUI() {

    /*
        IMPORTANT:

        Replace this function with the function
        from your existing expense tracker that
        redraws the expense list/dashboard.

        Example:

        renderExpenses(expenses);

    */


    if (typeof renderExpenses === "function") {

        renderExpenses(expenses);

    }


    if (
        typeof updateDashboard ===
        "function"
    ) {

        updateDashboard(expenses);

    }
}


// ------------------------------------------------------------
// 17. INITIAL PAGE LOAD
// ------------------------------------------------------------

document.addEventListener(
    "DOMContentLoaded",
    () => {

        // Load cached data immediately
        loadFromLocalStorage();


        // Show cached data
        refreshExpenseUI();


        console.log(
            "Expense tracker initialized."
        );

    }
);