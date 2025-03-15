# What's Next - Modern Windows To-Do List Application

What's Next is a sleek, always-on-top to-do list application for Windows. It features an elegant movable bubble interface that expands to show your to-do list when clicked, helping you stay organized without cluttering your screen. I usually use Notion notes to manage my tasks, but sometimes I just forget to open it. I felt the need of a bubble in front of my eyes to remind. I hope may of you gone through the same. I searched for a solution and found none. So I decided to build one. This is the result. I hope you like it.
**Note: This app is developed using Clause 3.7 sonnet model.**

## Features

- **Smart Floating Bubble**
  - Always-on-top bubble that shows your incomplete task count
  - Automatically snaps to screen edges when dragged nearby
  - Position is remembered between sessions

- **Powerful Task Management**
  - Regular tasks with due dates and times
  - Daily routines that reset each day
  - Priority levels (Low, Medium, High)
  - Add notes to any task
  - Create subtasks for complex items
  - Visual deadline warnings

- **Beautiful User Interface**
  - Elegant animations and transitions
  - Dark mode support throughout the application
  - Customizable bubble size and color schemes
  - Clean, modern design with rounded corners

- **System Integration**
  - Starts with Windows (optional setting)
  - Task notifications before deadlines
  - Minimizes to system tray
  - Low resource usage

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone this repository or download the source code
2. Open a terminal in the project folder
3. Install dependencies:
   ```
   npm install
   ```
4. Start the application:
   ```
   npm start
   ```

### Building for Production

To create a standalone executable:

1. Make sure electron-builder is installed:
   ```
   npm install -D electron-builder
   ```

2. The necessary configuration is already in package.json

3. Build the application:
   ```
   npm run build
   ```

## Usage

### Task Management
- **Adding tasks**: Type in the input box and press Enter or click Add
- **Completing tasks**: Click the checkbox next to a task
- **Setting due dates**: Click on the calendar icon in a task to show the date/time picker
- **Setting priority**: Select from Low, Medium, or High in the priority dropdown
- **Adding notes**: Click the notes icon on any task
- **Creating subtasks**: Click "Add subtasks" on any regular task

### Bubble Interface
- **Moving the bubble**: Click and drag the bubble to any position on screen
- **Edge snapping**: Drag near any screen edge and the bubble will snap to it
- **Accessing your tasks**: Click the bubble to expand the full application
- **Customizing the bubble**: Open settings to change size and color scheme

### Settings
- **Access settings**: Click the gear icon in the top-right corner
- **Dark mode**: Toggle between light and dark themes
- **Startup options**: Choose whether to launch with Windows
- **Notification timing**: Set how many minutes before a deadline to notify
- **Bubble customization**: Adjust size and color scheme, with live preview

## Recent Improvements

- **Enhanced Bubble Experience**
  - Removed glow effect for cleaner aesthetics
  - Improved animation smoothness with hardware acceleration
  - Added automatic edge snapping functionality
  - Implemented position memory between sessions

- **Dark Theme Enhancements**
  - Consistent dark theme across all UI elements
  - Improved contrast and readability in dark mode
  - Theme-aware daily routine cards and labels

- **Daily Routines**
  - Added support for recurring daily tasks
  - Automatic reset at midnight
  - Separate tab for better organization

## Contributing

Contributions are welcome! Feel free to fork the repository and submit pull requests.

## License

This project is licensed under the ISC License.

## Acknowledgements

- Built with Electron
- Uses electron-store for persistent storage
- Icons and design inspiration from various sources 