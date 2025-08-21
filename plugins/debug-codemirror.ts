// Debug plugin to catch CodeMirror errors
export default defineNuxtPlugin(() => {
  // Add a global error handler to catch and log CodeMirror errors
  if (process.client) {
    window.addEventListener('error', (event) => {
      if (event.error && event.error.stack && event.error.stack.includes('codemirror')) {
        console.error('CodeMirror Error:', {
          message: event.error.message,
          stack: event.error.stack,
          // Log any objects that might be causing the error
          event
        });
      }
    });

    // Monkey patch the keywords function in SQL module if it exists
    setTimeout(() => {
      try {
        // @ts-ignore - Accessing window object
        const viteModules = window.__vite_plugin_modules;
        if (viteModules) {
          console.log('Available Vite modules:', Object.keys(viteModules));
        }

        // Try to find the SQL module
        const sqlModulePath = Object.keys(viteModules || {}).find(path => 
          path.includes('codemirror') && path.includes('sql')
        );

        if (sqlModulePath) {
          console.log('Found SQL module:', sqlModulePath);
          // Log the module to inspect it
          console.log('SQL module content:', viteModules[sqlModulePath]);
        }
      } catch (err) {
        console.error('Error inspecting Vite modules:', err);
      }
    }, 1000);
  }
});
