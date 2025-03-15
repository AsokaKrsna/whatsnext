const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const notifier = require('node-notifier');

// Custom storage implementation
class Store {
  constructor(options) {
    this.path = path.join(app.getPath('userData'), options.name + '.json');
    this.defaults = options.defaults || {};
    this.data = this.load();
    this.lastSave = Date.now();
    this.pendingSave = false;
    this.saveDebounceTime = 500; // ms
  }

  load() {
    try {
      return fs.existsSync(this.path)
        ? JSON.parse(fs.readFileSync(this.path, 'utf8'))
        : this.defaults;
    } catch (error) {
      console.error('Error loading settings, using defaults:', error);
      return this.defaults;
    }
  }

  save() {
    // Avoid multiple saves in quick succession
    if (this.pendingSave) return;
    
    const now = Date.now();
    if (now - this.lastSave < this.saveDebounceTime) {
      // Debounce saves to prevent excessive disk I/O
      if (!this.pendingSave) {
        this.pendingSave = true;
        setTimeout(() => {
          this._actualSave();
          this.pendingSave = false;
        }, this.saveDebounceTime);
      }
    } else {
      this._actualSave();
    }
  }
  
  _actualSave() {
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
      this.lastSave = Date.now();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  get(key) {
    if (!key) return this.data;
    
    const parts = key.split('.');
    let current = this.data;
    
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    
    return current;
  }

  set(key, value) {
    if (typeof key === 'object') {
      this.data = { ...this.data, ...key };
      this.save();
      return;
    }
    
    const parts = key.split('.');
    let current = this.data;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
    this.save();
  }

  delete(key) {
    const parts = key.split('.');
    let current = this.data;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) return;
      current = current[part];
    }
    
    delete current[parts[parts.length - 1]];
    this.save();
  }
}

// Initialize storage
const store = new Store({
  name: 'bubble-todo',
  defaults: {
    tasks: [],
    recurringTasks: [],
    settings: {
      startWithWindows: true,
      notificationTime: 30 // minutes before deadline
    },
    lastRecurringTaskReset: 0 // Add default value for last reset timestamp
  }
});

// Variable declarations
let mainWindow;
let bubbleWindow;
let tray;
let isQuitting = false;
let ignoreBlur = false; // Add flag to control blur behavior

// Check for task notifications every minute
const checkNotifications = () => {
  const tasks = store.get('tasks');
  const notificationTime = store.get('settings.notificationTime');
  const now = new Date();
  
  tasks.forEach(task => {
    if (!task.completed && task.dueDate) {
      const dueDate = new Date(task.dueDate);
      const timeDiff = dueDate.getTime() - now.getTime();
      const minutesDiff = Math.floor(timeDiff / (1000 * 60));
      
      if (minutesDiff <= notificationTime && minutesDiff > 0 && !task.notified) {
        notifier.notify({
          title: 'Task Due Soon!',
          message: `"${task.title}" is due in ${minutesDiff} minutes!`,
          icon: path.join(__dirname, 'assets/icon.png'),
          sound: true,
          wait: true
        });
        
        // Mark task as notified
        const updatedTasks = tasks.map(t => 
          t.id === task.id ? { ...t, notified: true } : t
        );
        store.set('tasks', updatedTasks);
      }
    }
  });
};

// Helper function to check and perform edge snapping
function checkEdgeSnap() {
  try {
    if (!bubbleWindow || bubbleWindow.isDestroyed()) {
      console.log('Cannot check edge snap - bubble window is null or destroyed');
      return;
    }
    
    console.log('Checking for edge snapping...');
    
    // Get current position and size of bubble window
    const position = bubbleWindow.getPosition();
    const size = bubbleWindow.getSize();
    
    console.log('Bubble current position:', position, 'size:', size);
    
    // Get bubble size from settings to ensure consistency
    const settings = store.get('settings') || {};
    const bubbleSettings = settings.bubble || {};
    const bubbleSize = bubbleSettings.size || 40;
    
    // Get screen info
    const display = screen.getDisplayNearestPoint({ x: position[0], y: position[1] });
    const bounds = display.workArea;
    const scaleFactor = display.scaleFactor || 1;
    
    console.log('Screen bounds:', bounds, 'Scale factor:', scaleFactor);
    
    // Calculate distances to each edge
    const distToLeft = position[0] - bounds.x;
    const distToTop = position[1] - bounds.y;
    const distToRight = (bounds.x + bounds.width) - (position[0] + size[0]);
    const distToBottom = (bounds.y + bounds.height) - (position[1] + size[1]);
    
    console.log('Distances - Left:', distToLeft, 'Top:', distToTop, 'Right:', distToRight, 'Bottom:', distToBottom);
    
    // Find the nearest edge and distance
    const edges = [
      { name: 'left', dist: distToLeft },
      { name: 'top', dist: distToTop },
      { name: 'right', dist: distToRight },
      { name: 'bottom', dist: distToBottom }
    ];
    
    // Sort by distance (closest first)
    edges.sort((a, b) => a.dist - b.dist);
    const closestEdge = edges[0];
    
    // Threshold for snapping in pixels
    const snapThreshold = 30;
    
    console.log(`Closest edge: ${closestEdge.name}, distance: ${closestEdge.dist}px`);
    
    // Only snap if we're close enough to an edge
    if (closestEdge.dist < snapThreshold) {
      let newX = position[0];
      let newY = position[1];
      
      // Calculate the new position based on closest edge
      switch (closestEdge.name) {
        case 'left':
          newX = bounds.x;
          break;
        case 'right':
          newX = bounds.x + bounds.width - bubbleSize;
          break;
        case 'top':
          newY = bounds.y;
          break;
        case 'bottom':
          newY = bounds.y + bounds.height - bubbleSize;
          break;
      }
      
      console.log(`Snapping bubble to ${closestEdge.name} edge at position: ${newX},${newY}`);
      
      // Ensure consistent size across all displays
      bubbleWindow.setSize(bubbleSize, bubbleSize, false);
      
      // Set the new position with animation
      bubbleWindow.setPosition(newX, newY, true);
      
      // Save the new position
      const newPosition = { x: newX, y: newY };
      const settings = store.get('settings') || {};
      settings.bubblePosition = newPosition;
      store.set('settings', settings);
      
      console.log('Bubble position updated after snapping:', newPosition);
      
      // Force refresh to ensure proper rendering at the correct size
      setTimeout(() => {
        if (bubbleWindow && !bubbleWindow.isDestroyed()) {
          bubbleWindow.webContents.send('force-refresh-size', bubbleSize);
        }
      }, 100);
      
      return true;
    } else {
      console.log('Bubble not close enough to any edge for snapping');
      
      // Still ensure consistent size
      bubbleWindow.setSize(bubbleSize, bubbleSize, false);
      
      // Still save the current position
      const settings = store.get('settings') || {};
      settings.bubblePosition = { x: position[0], y: position[1] };
      store.set('settings', settings);
      return false;
    }
  } catch (error) {
    console.error('Error checking for edge snap:', error);
    return false;
  }
}

// Create the bubble window
function createBubbleWindow() {
  // Get the appropriate display - either the one where the bubble was last positioned or primary
  const settings = store.get('settings') || {};
  const savedPosition = settings.bubblePosition || {};
  
  let targetDisplay;
  if (savedPosition.x !== undefined && savedPosition.y !== undefined) {
    // Use the display where the bubble was last positioned
    targetDisplay = screen.getDisplayNearestPoint({ x: savedPosition.x, y: savedPosition.y });
  } else {
    // Default to primary display
    targetDisplay = screen.getPrimaryDisplay();
  }
  
  // Get bubble size from settings
  const bubbleSettings = settings.bubble || {};
  const bubbleSize = bubbleSettings.size || 40;
  
  // Log display info for debugging
  console.log('Creating bubble on display:', targetDisplay.id, 
              'bounds:', targetDisplay.bounds,
              'workArea:', targetDisplay.workArea,
              'scaleFactor:', targetDisplay.scaleFactor);
  
  // Get saved position or use default
  const defaultX = targetDisplay.workArea.x + targetDisplay.workArea.width - bubbleSize - 20;
  const defaultY = targetDisplay.workArea.y + targetDisplay.workArea.height / 2 - bubbleSize / 2;
  
  bubbleWindow = new BrowserWindow({
    width: bubbleSize,
    height: bubbleSize,
    x: savedPosition.x || defaultX,
    y: savedPosition.y || defaultY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  // Explicitly set size to ensure consistency
  bubbleWindow.setSize(bubbleSize, bubbleSize);

  bubbleWindow.loadFile('bubble.html');
  
  // Allow bubble to be moved by drag
  bubbleWindow.setMovable(true);
  
  // Add move event listener for edge snapping
  bubbleWindow.on('move', () => {
    console.log('Bubble window move detected in main process');
    if (bubbleWindow && !bubbleWindow.isDestroyed() && bubbleWindow.webContents) {
      bubbleWindow.webContents.send('window-moved');
    }
  });
  
  // Wait for window to load before adding more listeners
  bubbleWindow.webContents.on('did-finish-load', () => {
    console.log('Bubble window loaded completely');
    
    // Check for edge snapping on initial positioning
    setTimeout(() => {
      if (bubbleWindow && !bubbleWindow.isDestroyed()) {
        console.log('Performing initial edge snap check');
        // Directly perform the edge check here
        checkEdgeSnap();
      }
    }, 500);
  });
  
  // Clear any existing listeners to prevent duplicates
  ipcMain.removeAllListeners('bubble-clicked');
  
  // Handle bubble click to show/hide main window
  ipcMain.on('bubble-clicked', () => {
    console.log('Bubble clicked! Window visibility:', mainWindow.isVisible());
    
    if (mainWindow.isVisible()) {
      console.log('Hiding main window');
      mainWindow.hide();
    } else {
      console.log('Showing main window');
      
      // Position the main window on the same screen as the bubble
      if (bubbleWindow && !bubbleWindow.isDestroyed()) {
        try {
          // Get bubble position and screen
          const bubblePosition = bubbleWindow.getPosition();
          const bubbleScreen = screen.getDisplayNearestPoint({ 
            x: bubblePosition[0], 
            y: bubblePosition[1] 
          });
          
          // Calculate position to center main window on the same screen
          const mainSize = mainWindow.getSize();
          const newX = Math.floor(bubbleScreen.workArea.x + (bubbleScreen.workArea.width - mainSize[0]) / 2);
          const newY = Math.floor(bubbleScreen.workArea.y + (bubbleScreen.workArea.height - mainSize[1]) / 2);
          
          console.log(`Positioning main window on screen ${bubbleScreen.id} at ${newX},${newY}`);
          mainWindow.setPosition(newX, newY);
        } catch (error) {
          console.error('Error positioning main window:', error);
        }
      }
      
      mainWindow.show();
      
      // Ensure window is focused and brought to front
      mainWindow.focus();
      mainWindow.moveTop();
      
      // Small delay before allowing blur events to prevent immediate minimize
      setTimeout(() => {
        // Send a refresh signal to force UI update
        try {
          mainWindow.webContents.send('refresh-tasks');
        } catch (error) {
          console.error('Error sending refresh signal:', error);
        }
      }, 300);
    }
  });
  
  bubbleWindow.on('closed', () => {
    bubbleWindow = null;
  });
}

// Create the main window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // Log window ready event
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Main window content loaded completely');
  });
  
  // Hide the window when it loses focus (when user clicks outside)
  mainWindow.on('blur', () => {
    // Don't hide if developer tools are open or if blur should be ignored
    if (!mainWindow.webContents.isDevToolsOpened() && !ignoreBlur) {
      console.log('Window lost focus, hiding main window');
      mainWindow.hide();
    } else {
      console.log('Blur ignored or devtools open, keeping window visible');
    }
  });
  
  // Handle closing event
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });
}

// Create tray icon
function createTray() {
  try {
    const { nativeImage } = require('electron');
    // Create a tiny native image
    const image = nativeImage.createEmpty();
    tray = new Tray(image);
    
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Show App', 
        click: () => { 
          mainWindow.show();
        } 
      },
      { 
        label: 'Check for tasks', 
        click: () => {
          checkNotifications();
        } 
      },
      { type: 'separator' },
      { 
        label: 'Quit', 
        click: () => {
          isQuitting = true;
          app.quit();
        } 
      }
    ]);
    
    tray.setToolTip('Bubble Todo');
    tray.setContextMenu(contextMenu);
  } catch (error) {
    console.error('Failed to create tray icon:', error);
    // Continue without tray icon if it fails
  }
}

// Set up auto launch
const setAutoLaunch = () => {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: store.get('settings.startWithWindows'),
      path: process.execPath
    });
  }
};

// Initialize application
app.whenReady().then(() => {
  try {
    // Create windows but don't show main window initially
    createMainWindow();
    
    // Don't show main window by default, let user click the bubble to show it
    // mainWindow.show(); - commenting this out
    console.log('Main window created, hidden by default');
    
    // Create bubble window
    try {
      createBubbleWindow();
      console.log('Bubble window created successfully');
    } catch (error) {
      console.error('Failed to create bubble window:', error);
    }
    
    // Create tray icon
    createTray();
    
    // Set auto launch
    setAutoLaunch();
    
    // Set up periodic task checker
    setInterval(checkNotifications, 60000); // Check every minute
    
    // Handle IPC messages from renderer
    ipcMain.on('update-tasks', (event, tasks) => {
      store.set('tasks', tasks);
    });
    
    ipcMain.on('update-task', (event, updatedTask) => {
      try {
        const tasks = store.get('tasks') || [];
        const updatedTasks = tasks.map(task => 
          task.id === updatedTask.id ? updatedTask : task
        );
        store.set('tasks', updatedTasks);
        
        // Notify bubble to update count if needed
        if (bubbleWindow && !bubbleWindow.isDestroyed()) {
          bubbleWindow.webContents.send('tasks-updated');
        }
      } catch (error) {
        console.error('Error updating task:', error);
      }
    });
    
    ipcMain.on('delete-task', (event, taskId) => {
      try {
        const tasks = store.get('tasks') || [];
        const updatedTasks = tasks.filter(task => task.id !== taskId);
        store.set('tasks', updatedTasks);
        
        // Notify bubble to update count
        if (bubbleWindow && !bubbleWindow.isDestroyed()) {
          bubbleWindow.webContents.send('tasks-updated');
        }
      } catch (error) {
        console.error('Error deleting task:', error);
      }
    });
    
    ipcMain.on('get-tasks', (event) => {
      try {
        event.returnValue = store.get('tasks') || [];
      } catch (error) {
        console.error('Error getting tasks:', error);
        event.returnValue = [];
      }
    });
    
    ipcMain.on('get-settings', (event) => {
      try {
        event.returnValue = store.get('settings') || {
          startWithWindows: true,
          notificationTime: 30
        };
      } catch (error) {
        console.error('Error getting settings:', error);
        event.returnValue = {
          startWithWindows: true,
          notificationTime: 30
        };
      }
    });
    
    // Add handler to force refresh settings
    ipcMain.on('refresh-settings', (event) => {
      try {
        console.log('Forced refresh of settings requested');
        // Reload the settings from disk
        store.data = store.load();
        event.returnValue = true;
      } catch (error) {
        console.error('Error refreshing settings:', error);
        event.returnValue = false;
      }
    });
    
    // Explicitly send a refresh command to the bubble
    function refreshBubble() {
      if (bubbleWindow && !bubbleWindow.isDestroyed()) {
        console.log('Sending refresh command to bubble window');
        bubbleWindow.webContents.send('refresh-bubble');
      }
    }
    
    ipcMain.on('update-settings', (event, settings) => {
      store.set('settings', settings);
      setAutoLaunch();
      console.log('Settings updated:', JSON.stringify(settings.bubble || {}, null, 2));
      
      // Handle bubble customization by recreating the bubble window
      if (bubbleWindow && !bubbleWindow.isDestroyed()) {
        // First, save the current position of the bubble window
        const bubblePosition = bubbleWindow.getPosition();
        
        // Close the existing bubble window
        bubbleWindow.close();
        bubbleWindow = null;
        
        // Create a new bubble window with the updated settings
        setTimeout(() => {
          createBubbleWindow();
          
          // Restore the bubble window position if we saved it
          if (bubblePosition && bubblePosition.length === 2) {
            bubbleWindow.setPosition(bubblePosition[0], bubblePosition[1]);
          }
          
          // Extra delay to ensure bubble is fully loaded before trying to apply settings
          setTimeout(() => {
            refreshBubble();
          }, 200);
          
          // Send notification that the bubble has been updated
          console.log('Bubble window recreated with new settings');
        }, 100);
      } else {
        // Just notify the bubble window about settings update for customization
        if (bubbleWindow && !bubbleWindow.isDestroyed()) {
          bubbleWindow.webContents.send('settings-updated');
          
          // Also try the explicit refresh
          setTimeout(refreshBubble, 100);
        }
      }
    });
    
    // Handle IPC messages for recurring tasks
    ipcMain.on('update-recurring-tasks', (event, recurringTasks) => {
      store.set('recurringTasks', recurringTasks);
    });
    
    ipcMain.on('update-recurring-task', (event, updatedTask) => {
      try {
        const tasks = store.get('recurringTasks') || [];
        const updatedTasks = tasks.map(task => 
          task.id === updatedTask.id ? updatedTask : task
        );
        store.set('recurringTasks', updatedTasks);
      } catch (error) {
        console.error('Error updating recurring task:', error);
      }
    });
    
    ipcMain.on('delete-recurring-task', (event, taskId) => {
      try {
        const tasks = store.get('recurringTasks') || [];
        const updatedTasks = tasks.filter(task => task.id !== taskId);
        store.set('recurringTasks', updatedTasks);
      } catch (error) {
        console.error('Error deleting recurring task:', error);
      }
    });
    
    ipcMain.on('get-recurring-tasks', (event) => {
      try {
        event.returnValue = store.get('recurringTasks') || [];
      } catch (error) {
        console.error('Error getting recurring tasks:', error);
        event.returnValue = [];
      }
    });
    
    // Add handlers for last reset timestamp
    ipcMain.on('set-last-reset-timestamp', (event, timestamp) => {
      try {
        store.set('lastRecurringTaskReset', timestamp);
        console.log('Last reset timestamp updated:', new Date(timestamp).toISOString());
      } catch (error) {
        console.error('Error setting last reset timestamp:', error);
      }
    });
    
    ipcMain.on('get-last-reset-timestamp', (event) => {
      try {
        event.returnValue = store.get('lastRecurringTaskReset') || 0;
      } catch (error) {
        console.error('Error getting last reset timestamp:', error);
        event.returnValue = 0;
      }
    });
    
    // Additional logging to debug IPC issues
    ipcMain.on('renderer-error', (event, errorMessage) => {
      console.error('Error from renderer:', errorMessage);
    });
    
    // Add handler for saving bubble position
    ipcMain.on('save-bubble-position', (event, position) => {
      try {
        // Get current settings
        const settings = store.get('settings') || {};
        
        // Update settings with bubble position
        settings.bubblePosition = position;
        
        // Save updated settings
        store.set('settings', settings);
        
        console.log('Bubble position saved:', position);
      } catch (error) {
        console.error('Error saving bubble position:', error);
      }
    });
    
    // Add handlers for custom window controls
    ipcMain.on('minimize-window', () => {
      if (mainWindow) {
        mainWindow.minimize();
      }
    });
    
    ipcMain.on('hide-window', () => {
      if (mainWindow) {
        mainWindow.hide();
      }
    });
    
    // Add handlers to control blur behavior
    ipcMain.on('ignore-blur', () => {
      ignoreBlur = true;
      console.log('Blur events will be ignored');
    });
    
    ipcMain.on('respect-blur', () => {
      ignoreBlur = false;
      console.log('Blur events will be respected');
    });
    
    // Add handler for edge snapping
    let lastEdgeCheckTime = 0;
    const edgeCheckThrottle = 300; // ms
    
    ipcMain.on('check-edge-snap', (event) => {
      try {
        // Throttle edge snap checks to reduce redundant processing
        const now = Date.now();
        if (now - lastEdgeCheckTime < edgeCheckThrottle) {
          return;
        }
        lastEdgeCheckTime = now;
        
        checkEdgeSnap();
      } catch (error) {
        console.error('Error in check-edge-snap handler:', error);
      }
    });
    
    // Add listener for window move events
    if (bubbleWindow) {
      bubbleWindow.on('move', () => {
        console.log('Bubble window move detected in main process');
        if (bubbleWindow && !bubbleWindow.isDestroyed()) {
          bubbleWindow.webContents.send('window-moved');
        }
      });
    }
    
    console.log('Application initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createBubbleWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
}); 