<?php

declare(strict_types=1);

namespace Belsignum\ViteCritical\Domain\Model;

use Praetorius\ViteAssetCollector\Utility\VitePathUtility;

final class ViteManifestItem
{
    public function __construct(
        public readonly string $identifier,
        public readonly ?string $src,
        public readonly string $file,
        public readonly bool $isEntry,
        public readonly bool $isDynamicEntry,
        public readonly array $assets,
        public readonly array $css,
        public readonly array $imports,
        public readonly array $dynamicImports,
        public readonly ?string $name,
        public readonly string $critical,
        public readonly string $deferred
    ) {}

    public static function fromArray(array $item, string $identifier): self
    {
        return new self(
            $identifier,
            $item['src'] ?? null,
            $item['file'],
            (bool)($item['isEntry'] ?? false),
            (bool)($item['isDynamicEntry'] ?? false),
            (array)($item['assets'] ?? []),
            (array)($item['css'] ?? []),
            (array)($item['imports'] ?? []),
            (array)($item['dynamicImports'] ?? []),
            $item['name'] ?? null,
            $item['critical'] ?? '',
            $item['deferred'] ?? ''
        );
    }

    public function isCss(): bool
    {
        return VitePathUtility::isCssFile($this->file);
    }
}
