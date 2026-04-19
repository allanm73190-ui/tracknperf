export function Skeleton({
  width = "100%",
  height = 20,
  borderRadius = 6,
}: {
  width?: string | number;
  height?: number;
  borderRadius?: number;
}) {
  return (
    <>
      <div
        style={{
          width,
          height,
          borderRadius,
          background: "linear-gradient(90deg, #1a1a1a 25%, #222 50%, #1a1a1a 75%)",
          backgroundSize: "200% 100%",
          animation: "sk-shimmer 1.4s infinite",
          display: "block",
        }}
      />
      <style>{`@keyframes sk-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </>
  );
}
