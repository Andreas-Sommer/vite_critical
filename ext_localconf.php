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

foreach ($xClass as $source => $target)
{
    $GLOBALS['TYPO3_CONF_VARS']['SYS']['Objects'][$source] = ['className' => $target];
}
