<?php

declare(strict_types=1);

namespace Belsignum\ViteCritical\Command;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use TYPO3\CMS\Core\Site\SiteFinder;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Frontend\Http\UrlProcessorInterface;

class GetSlugsCommand extends Command
{
    public function __construct(
        private readonly SiteFinder $siteFinder
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->setDescription('Resolves PIDs to slugs for a given site.')
            ->addOption('site', null, InputOption::VALUE_REQUIRED, 'The site identifier')
            ->addOption('pids', null, InputOption::VALUE_REQUIRED, 'Comma-separated list of PIDs');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $siteIdentifier = $input->getOption('site');
        $pidsRaw = $input->getOption('pids');

        if (!$siteIdentifier || !$pidsRaw) {
            $output->writeln('Missing --site or --pids option.');
            return Command::FAILURE;
        }

        try {
            $site = $this->siteFinder->getSiteByIdentifier($siteIdentifier);
        } catch (\Exception $e) {
            $output->writeln('Site not found: ' . $siteIdentifier);
            return Command::FAILURE;
        }

        $pids = GeneralUtility::intExplode(',', $pidsRaw, true);
        $result = [];

        foreach ($pids as $pid) {
            // For now, we only resolve for the default language (0)
            try {
                $url = (string)$site->getRouter()->generateUri($pid, ['_language' => 0]);
                // Ensure we get only the path part if it's an absolute URL
                $path = parse_url($url, PHP_URL_PATH) ?: '/';
                $result[$pid] = $path;
            } catch (\Exception $e) {
                // If PID cannot be resolved, we skip it
            }
        }

        $output->write(json_encode($result));
        return Command::SUCCESS;
    }
}
