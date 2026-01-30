<?php

use Belsignum\ViteCritical\Xclass\Service\ViteService;
use Belsignum\ViteCritical\Xclass\ViewHelpers\AssetViewHelper;

if (!defined('TYPO3'))
{
    die('Access denied.');
}

$xClass = [
    \Praetorius\ViteAssetCollector\Service\ViteService::class => ViteService::class,
];
$simulateDev = getenv('VITE_ASSET_COLLECTOR_SIMULATE_APPLICATION_CONTEXT_DEVELOPMENT');
if (!empty($simulateDev) && $simulateDev === '1') {
    $xClass[\Praetorius\ViteAssetCollector\ViewHelpers\AssetViewHelper::class] = AssetViewHelper::class;
}

// 1. Query-Parameter vom cHash ausschließen
$GLOBALS['TYPO3_CONF_VARS']['FE']['cacheHash']['excludedParameters'][] = 'tx_vitecritical_css[omit]';

// 2. TypoScript zur Cache-Deaktivierung registrieren
\TYPO3\CMS\Core\Utility\ExtensionManagementUtility::addTypoScript(
    'vite_critical',
    'setup',
    '[request.getQueryParams()[\'tx_vitecritical_css\'][\'omit\'] == 1]
        config.no_cache = 1
    [END]'
);

foreach ($xClass as $source => $target)
{
    $GLOBALS['TYPO3_CONF_VARS']['SYS']['Objects'][$source] = ['className' => $target];
}
