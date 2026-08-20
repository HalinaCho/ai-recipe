export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col px-container-padding py-8">
      {children}
    </main>
  );
}
