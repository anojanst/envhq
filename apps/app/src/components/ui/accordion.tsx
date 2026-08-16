import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("group/accordion-item", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header data-slot="accordion-header" className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger flex flex-1 items-start justify-between gap-4 rounded-lg py-4 text-left outline-none",
          "transition-colors duration-150 ease-fluid hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-fluid group-data-panel-open/accordion-trigger:rotate-180 motion-reduce:transition-none"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionPanel({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-panel"
      // Height is the one property worth animating on layout here: there is no
      // transform equivalent for a collapse. Base UI supplies the measured
      // height, so this never animates to `auto`. Kept short because it costs
      // layout on every frame.
      // Closed by default and opened by `data-open`, rather than open by
      // default and clamped shut by `data-starting-style`. Base UI leaves
      // `data-starting-style` on the element alongside `data-open`, so the
      // clamp never lifts and the panel stays at zero height.
      className={cn(
        "h-0 overflow-hidden transition-[height] duration-200 ease-fluid",
        "data-open:h-(--accordion-panel-height) motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      <div className="pb-4">{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionPanel }
