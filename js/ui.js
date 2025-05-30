/**
 * UI interactions for the application
 */
const UIController = (() => {
    let searchTimeout = null;

    /**
     * Initialize UI event listeners
     */
    const init = () => {
        document.querySelectorAll('.delivery-tab').forEach(tab => {
            tab.addEventListener('click', function () {
                document.querySelectorAll('.delivery-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');

                MapService.changeService(this.dataset.service);
            });
        });

        document.getElementById('searchInput').addEventListener('input', function (e) {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();

            searchTimeout = setTimeout(() => {
                MapService.searchWithQuery(query);
            }, 500);
        });

        document.getElementById('selectButton').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            TelegramApp.hapticFeedback('medium');

            TelegramApp.sendDeliveryData(MapService.selectedPoint, MapService.currentService);
        });
    };

    return {
        init
    };
})();
