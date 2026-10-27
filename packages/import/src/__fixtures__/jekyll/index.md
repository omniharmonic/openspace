---

layout: default
title: Welcome
---

# Grow with us

We are a volunteer garden on the corner of Elm and Fifth. Everyone is welcome on **work days**.

![Seedlings in trays]({{ "/assets/img/seeds.png" | relative_url }})

[Read about us](about.md) or see the [latest notes]({{ site.baseurl }}/journal/).

## Latest notes

{% for post in site.posts limit:3 %}
- [{{ post.title }}]({{ post.url | relative_url }}) — {{ post.date | date: "%B %-d, %Y" }}
  {% endfor %}
