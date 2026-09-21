import Image from "next/image";

export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <span className="brand-logo-frame">
      <Image
        className="brand-logo"
        src="/brill-logo.webp"
        alt="Brill Creations"
        width={345}
        height={101}
        priority={priority}
      />
    </span>
  );
}
