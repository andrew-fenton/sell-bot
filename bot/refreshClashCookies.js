import CDP from 'chrome-remote-interface';

export class RefreshClashCookies {
    /**
     * Gets, filters, and unifies cookies.
     */
    async refreshCookie() {
        const cookies = await this.getCookies();
        const filteredCookies = this.filterCookies(cookies);
        return this.unifyCookies(filteredCookies);
    }
    
    /**
     * Accesses a chrome instance running in remote debugging mode to acquire
     * all browser cookies.
     * 
     * @returns {Array} - Array of cookies
     */
    async getCookies() {
        let client;
        try {
            client = await CDP();
            const { Network, Page } = client;
    
            await Promise.all([Network.enable(), Page.enable()]);
    
            await Page.navigate({ url: 'https://clash.gg' });
            await Page.loadEventFired();
    
            const { cookies } = await Network.getAllCookies();
            return cookies;
    
        } catch (error) {
            console.error('Error fetching cookies:', error);
        } finally {
            if (client) {
                await client.close();
            }
        }
    }

    /**
     * Filters through cookies and returns cookies pertaining to clash.gg
     * 
     * @param {Array} cookies - Array of cookies
     * @returns {Array} - Array of clash.gg cookies
     */
    filterCookies(cookies) {
        const cookieArray = [];
        for (const cookie of cookies) {
            if ((cookie.domain).includes("clash.gg")) {
                cookieArray.push(cookie);
            }
        }
        return cookieArray;
    }

    /**
     * Takes cookies in array and unifies them into one string. Order is irrelevant.
     *  Must follow structure:
     *      cookie.name=cookie.value;
     * 
     * @param {Array} cookies 
     */
    unifyCookies(cookies) {
        let unifiedCookie = "";
        for (let index = 0; index < cookies.length; index++) {
            unifiedCookie += `${cookies[index].name}=${cookies[index].value}`;
            if (index < cookies.length - 1) {
                unifiedCookie += "; "; 
            }
        }
        return unifiedCookie;
    }
}