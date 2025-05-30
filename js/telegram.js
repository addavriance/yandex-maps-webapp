/**
 * Telegram WebApp integration
 */
const TelegramApp = (() => {
    const tg = window.Telegram.WebApp;

    console.log('Telegram WebApp initialized:');
    console.log('- WebApp version:', tg.version);
    console.log('- Platform:', tg.platform);

    tg.ready();
    tg.expand();

    /**
     * Apply Telegram theme to the application
     */
    const applyTheme = () => {
        if (tg.themeParams.bg_color) {
            const isDark = tg.colorScheme === 'dark';
            if (isDark) {
                document.documentElement.style.setProperty('--off-white', '#1a1a1a');
                document.documentElement.style.setProperty('--white', '#2a2a2a');
                document.documentElement.style.setProperty('--text-dark', '#e0e0e0');
                document.documentElement.style.setProperty('--border', 'rgba(255, 255, 255, 0.1)');
            }
        }
    };

    /**
     * Send haptic feedback if supported by the platform
     * @param {string} style - The style of the haptic feedback (impact, notification, selection)
     */
    const hapticFeedback = (style = 'medium') => {
        if (tg.HapticFeedback) {
            try {
                switch (style) {
                    case 'light':
                        tg.HapticFeedback.impactOccurred('light');
                        break;
                    case 'medium':
                        tg.HapticFeedback.impactOccurred('medium');
                        break;
                    case 'heavy':
                        tg.HapticFeedback.impactOccurred('heavy');
                        break;
                    case 'selection':
                        tg.HapticFeedback.selectionChanged();
                        break;
                    case 'success':
                        tg.HapticFeedback.notificationOccurred('success');
                        break;
                    case 'warning':
                        tg.HapticFeedback.notificationOccurred('warning');
                        break;
                    case 'error':
                        tg.HapticFeedback.notificationOccurred('error');
                        break;
                    default:
                        tg.HapticFeedback.impactOccurred('medium');
                }
            } catch (error) {
                console.warn('Haptic feedback not supported:', error);
            }
        }
    };

    /**
     * Send delivery point data to Telegram
     * @param {Object} selectedPoint - The selected delivery point data
     * @param {string} currentService - The current delivery service
     */
    const sendDeliveryData = (selectedPoint, currentService) => {
        if (!selectedPoint) {
            tg.showAlert('Пожалуйста, выберите пункт выдачи на карте');
            return;
        }

        const data = {
            service: currentService,
            name: selectedPoint.name,
            address: selectedPoint.address,
            coordinates: selectedPoint.coordinates
        };

        console.log('Sending data to Telegram:', data);

        try {
            if (tg.sendData) {
                hapticFeedback('success');

                tg.sendData(JSON.stringify(data));
                console.log('Data sent successfully via sendData');

                setTimeout(() => {
                    if (tg.close) {
                        tg.close();
                    }
                }, 300);
            } else {
                console.error('tg.sendData is not available');
                hapticFeedback('error');
            }
        } catch (error) {
            console.error('Error sending data:', error);
            hapticFeedback('error');
            tg.showAlert('Ошибка отправки данных: ' + error.message);
        }
    };

    applyTheme();
    tg.onEvent('themeChanged', applyTheme);

    return {
        sendDeliveryData,
        hapticFeedback,
        instance: tg
    };
})();
