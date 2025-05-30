/**
 * Main application entry point
 */
(() => {
    /**
     * Initialize the application when Yandex Maps API is ready
     */
    ymaps.ready(async () => {
        try {
            await MapService.initMap();

            UIController.init();

            console.log('Application initialized successfully');
        } catch (error) {
            console.error('Application initialization failed:', error);
        }
    });
})();
