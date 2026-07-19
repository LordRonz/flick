type BrandMarkProps = {
	dark?: boolean;
};

export function BrandMark({ dark = false }: BrandMarkProps) {
	return (
		<>
			<img
				className="brand-logo"
				src="/assets/audio/logo.webp"
				alt=""
				width="1254"
				height="1254"
				decoding="async"
			/>
			<span className={`brand-wordmark ${dark ? "brand-wordmark--dark" : ""}`}>
				<strong>Flick</strong>
				<span>Arena</span>
			</span>
		</>
	);
}
