<?php

$EM_CONF[$_EXTKEY] = [
    'title' => 'Vite Critical',
    'description' => 'Critical CSS extractor and provider + html minification',
    'category' => 'fe',
    'author' => 'Andreas Sommer',
    'author_email' => 'sommer@belsignum.com',
    'state' => 'alpha',
    'version' => '1.0.0',
    'constraints' => [
        'depends' => [
            'typo3' => '12.4.0-13.4.99',
        ],
    ],
    'autoload' => [
        'psr-4' => [
            'Belsignum\\ViteCritical\\' => 'Classes/',
        ],
    ],
];
