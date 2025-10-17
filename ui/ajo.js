
document.addEventListener('DOMContentLoaded', () => {
    const filters = {
        name: document.getElementById('filter-name'),
        status: document.getElementById('filter-status'),
        channel: document.getElementById('filter-channel'),
        audienceId: document.getElementById('filter-audienceId'),
        category: document.getElementById('filter-category'),
        namespace: document.getElementById('filter-namespace'),
    };

    const campaignList = document.getElementById('campaign-list');
    const pagination = document.getElementById('pagination');
    const activeFiltersContainer = document.getElementById('active-filters');
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modal-content');
    const modalClose = document.getElementById('modal-close');

    let allCampaignsOnPage = [];
    let currentPage = 0;
    const count = 10; // Number of items per page

    async function fetchCampaigns(page = 0) {
        try {
            const context = await window.electronBridge.getContext();
            const sandboxName = context.sandboxName;

            const response = await window.electronBridge.aepRequest({
                path: '/journey/campaigns/service/campaigns',
                params: `orderby=-modifiedAt&page=${page}&count=${count}&campaignType=Scheduled`,
                sandboxName: sandboxName
            });

            allCampaignsOnPage = response.children || [];
            renderCampaigns(allCampaignsOnPage);
            renderPagination(response.page, response.count);
        } catch (error) {
            console.error('Error fetching campaigns:', error);
            campaignList.innerHTML = '<p class="text-red-500">Failed to load campaigns.</p>';
        }
    }

    function renderCampaigns(campaigns) {
        campaignList.innerHTML = campaigns.map(campaign => `
            <div class="border p-4 rounded-lg">
                <div class="flex justify-between items-center">
                    <span class="px-2 py-1 text-xs font-semibold text-white ${getStatusColor(campaign.status)} rounded-full">${campaign.status}</span>
                    <button class="text-blue-500 view-details" data-campaign='${JSON.stringify(campaign)}'>Ver Detalhes</button>
                </div>
                <h3 class="text-lg font-bold mt-2">${campaign.label}</h3>
                <p><strong>Channels:</strong> ${campaign.channels.join(', ')}</p>
                <p><strong>Audience ID:</strong> ${campaign.audienceID}</p>
                <p><strong>Category:</strong> ${campaign.category}</p>
                <p><strong>Namespace:</strong> ${campaign.identityNamespace}</p>
                <p class="text-sm text-gray-500">Modified by ${campaign.modifiedBy} on ${new Date(campaign.modifiedAt).toLocaleDateString()}</p>
            </div>
        `).join('');
    }

    function getStatusColor(status) {
        switch (status) {
            case 'live': return 'bg-green-500';
            case 'draft': return 'bg-yellow-500';
            case 'finished': return 'bg-blue-500';
            case 'archived': return 'bg-gray-500';
            default: return 'bg-gray-400';
        }
    }

    function renderPagination(pageInfo, totalCount) {
        const { number, size, totalPages } = pageInfo;
        pagination.innerHTML = `
            <button id="prev-page" ${number === 0 ? 'disabled' : ''} class="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400">Previous</button>
            <span>Page ${number + 1} of ${totalPages}</span>
            <button id="next-page" ${number + 1 >= totalPages ? 'disabled' : ''} class="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400">Next</button>
        `;

        document.getElementById('prev-page').addEventListener('click', () => fetchCampaigns(number - 1));
        document.getElementById('next-page').addEventListener('click', () => fetchCampaigns(number + 1));
    }

    function applyFilters() {
        const activeFilters = {};
        for (const key in filters) {
            if (filters[key].value) {
                activeFilters[key] = filters[key].value;
            }
        }

        const filteredCampaigns = allCampaignsOnPage.filter(campaign => {
            return Object.entries(activeFilters).every(([key, value]) => {
                const campaignValue = campaign[key] || '';
                return campaignValue.toLowerCase().includes(value.toLowerCase());
            });
        });

        renderCampaigns(filteredCampaigns);
        renderActiveFilters(activeFilters);
    }

    function renderActiveFilters(activeFilters) {
        activeFiltersContainer.innerHTML = Object.entries(activeFilters).map(([key, value]) => `
            <span class="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2">
                ${key}: ${value}
                <button class="ml-2 text-red-500 remove-filter" data-filter="${key}">x</button>
            </span>
        `).join('');
    }

    Object.values(filters).forEach(filter => {
        filter.addEventListener('input', applyFilters);
    });

    activeFiltersContainer.addEventListener('click', event => {
        if (event.target.classList.contains('remove-filter')) {
            const filterKey = event.target.dataset.filter;
            filters[filterKey].value = '';
            applyFilters();
        }
    });

    campaignList.addEventListener('click', event => {
        if (event.target.classList.contains('view-details')) {
            const campaignData = JSON.parse(event.target.dataset.campaign);
            modalContent.textContent = JSON.stringify(campaignData, null, 2);
            modal.classList.remove('hidden');
        }
    });

    modalClose.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Initial fetch
    fetchCampaigns();
});
